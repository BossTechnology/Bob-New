// Reads BOb's projections for the three demo screens: Performance,
// Interactions and Quality.
//
// P5 §3.3 and §3.4: the application reads as `bob_app`, under the claim of one
// `org_id`, and never with the service role. Every read here goes through
// asBobApp (db.ts): one read-only transaction as bob_app with the claim set.
//
// The connection is the box's `bob/app.env` (runtime.ts), or locally the
// BOb-engine Supabase stack. BOB_ORG_ID is the box's single organisation
// (P5, one organisation per box; Q6 keeps it as provisioning configuration).
import type { Pool, PoolClient } from 'pg'
import {
  BUCKET_MS, ceilToBucket,
  type ActorType, type Channel, type CountAggregate, type DurationAggregate,
} from './matrix.ts'
import { asBobApp } from './db.ts'
import { readCellStates, type CellState } from './cell-state.ts'
import type { DurationByChannel, SentimentAggregate } from './screens.ts'
import { BobConfigError, boxOrgId } from './runtime.ts'

export { asBobApp, BobConfigError, boxOrgId }
export class UnknownChannelError extends Error {}

export const PROJECTIONS = [
  'proj_metric_counts', 'proj_sentiment', 'proj_durations', 'proj_channel_health',
  'proj_rum_signals', 'proj_actor_metrics', 'proj_detections', 'proj_deliveries',
] as const
export type Projection = (typeof PROJECTIONS)[number]

const TIME_COLUMN: Record<Projection, string> = {
  proj_metric_counts: 'bucket_start',
  proj_sentiment: 'bucket_start',
  proj_durations: 'bucket_start',
  proj_channel_health: 'bucket_start',
  proj_rum_signals: 'bucket_start',
  proj_actor_metrics: 'bucket_start',
  proj_detections: 'detected_at',
  proj_deliveries: 'attempted_at',
}
const SEALED: Record<Projection, boolean> = {
  proj_metric_counts: true, proj_sentiment: true, proj_durations: true,
  proj_channel_health: true, proj_rum_signals: true, proj_actor_metrics: true,
  proj_detections: false, proj_deliveries: false,
}

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v))

export async function readChannels(db: PoolClient): Promise<Channel[]> {
  const { rows } = await db.query(`
    SELECT c.id, c.display_name, c.channel_type, c.lag_seconds, c.idle_bound_seconds,
           coalesce(array_agg(k.capability ORDER BY k.capability)
                    FILTER (WHERE k.capability IS NOT NULL), '{}') AS capabilities
      FROM bob.channels c
      LEFT JOIN bob.channel_capabilities k ON k.channel_id = c.id
     GROUP BY c.id
     ORDER BY c.display_order, c.display_name`)
  return rows.map((r) => ({
    id: r.id, name: r.display_name, type: r.channel_type,
    lag_seconds: r.lag_seconds, idle_bound_seconds: r.idle_bound_seconds,
    capabilities: r.capabilities,
  }))
}

// The newest source_watermark over the eight, for the default window.
export async function readWatermark(db: PoolClient): Promise<Date | null> {
  const parts = PROJECTIONS.map((t) => `SELECT max(source_watermark) AS w FROM bob.${t}`)
  const { rows } = await db.query(`SELECT max(w) AS w FROM (${parts.join(' UNION ALL ')}) s`)
  return rows[0]?.w ?? null
}

export type Window = { from: Date; to: Date; channelIds: string[] }

export async function readMetricCounts(db: PoolClient, w: Window): Promise<CountAggregate[]> {
  const { rows } = await db.query(`
    SELECT metric_id, actor_type, count(*)::int AS rows, sum(event_count) AS value,
           count(*) FILTER (WHERE NOT sealed)::int AS open
      FROM bob.proj_metric_counts
     WHERE bucket_start >= $1 AND bucket_start < $2 AND channel_id = ANY($3::uuid[])
     GROUP BY metric_id, actor_type`, [w.from, w.to, w.channelIds])
  return rows.map((r) => ({
    key: r.metric_id, actor_type: r.actor_type as ActorType,
    rows: r.rows, value: num(r.value), open: r.open,
  }))
}

export async function readResponseTimes(db: PoolClient, w: Window): Promise<DurationAggregate[]> {
  const { rows } = await db.query(`
    SELECT actor_type, count(*)::int AS rows, sum(n) AS n, sum(sum_ms) AS sum_ms,
           count(*) FILTER (WHERE NOT sealed)::int AS open
      FROM bob.proj_durations
     WHERE measure = 'response_time'
       AND bucket_start >= $1 AND bucket_start < $2 AND channel_id = ANY($3::uuid[])
     GROUP BY actor_type`, [w.from, w.to, w.channelIds])
  return rows.map((r) => ({
    actor_type: r.actor_type as ActorType,
    rows: r.rows, n: num(r.n), sum_ms: num(r.sum_ms), open: r.open,
  }))
}

// Rows per projection and channel in the window. A pair with no entry has no
// row; the page says so instead of printing 0.
export type Presence = { table: Projection; channel_id: string | null; rows: number; open: number | null }

export async function readPresence(db: PoolClient, w: Window): Promise<Presence[]> {
  // proj_deliveries carries no channel (§6.8) and a detection may have none
  // (§6.7): those rows are counted under a null channel.
  const parts = PROJECTIONS.map((t) => {
    const channel = t === 'proj_deliveries' ? 'NULL::uuid' : 'channel_id'
    const scope = t === 'proj_deliveries' ? ''
      : ` AND (channel_id = ANY($3::uuid[])${t === 'proj_detections' ? ' OR channel_id IS NULL' : ''})`
    return `
    SELECT '${t}' AS t, ${channel} AS channel_id, count(*)::int AS rows,
           ${SEALED[t] ? 'count(*) FILTER (WHERE NOT sealed)::int' : 'NULL::int'} AS open
      FROM bob.${t}
     WHERE ${TIME_COLUMN[t]} >= $1 AND ${TIME_COLUMN[t]} < $2${scope}
     GROUP BY 2`
  })
  const { rows } = await db.query(parts.join(' UNION ALL '), [w.from, w.to, w.channelIds])
  return rows.map((r) => ({ table: r.t, channel_id: r.channel_id, rows: r.rows, open: r.open }))
}

export type PerformanceRead = {
  orgId: string
  channels: Channel[]
  selected: Channel[]
  window: Window
  watermark: Date | null
  counts: CountAggregate[]
  responseTimes: DurationAggregate[]
  presence: Presence[]
  // Slice 3's rollup over the selection and window; null without Slice 3.
  cells: CellState[] | null
}

type Query = { from?: string; to?: string; channel?: string; range?: string; tz?: string }
type Scope = { channels: Channel[]; selected: Channel[]; window: Window; watermark: Date | null }

// Channels, the selection and the window, shared by the three screens.
async function readScope(db: PoolClient, q: Query): Promise<Scope> {
  const channels = await readChannels(db)
  const selected = q.channel ? channels.filter((c) => c.id === q.channel) : channels
  // An unknown id is not an empty selection: with nothing selected every row
  // would read as not configured.
  if (q.channel && selected.length === 0) throw new UnknownChannelError(q.channel)
  const watermark = await readWatermark(db)
  const { from, to } = resolveWindow(q, watermark)
  return { channels, selected, watermark, window: { from, to, channelIds: selected.map((c) => c.id) } }
}

// At most 31 days per read (review of PR #30, point 3): with a pool of four
// clients, an open-ended ?from=1970-01-01 could hold them all.
export const MAX_WINDOW_MS = 31 * 24 * 3600_000

// The simulator's buttons (P-4): now, today, this week, this month. The start
// is the viewer's local midnight; `tz` is their offset in minutes with the sign
// of Date.getTimezoneOffset(). The day is the one the window's last instant
// falls in, so a watermark right on midnight reads the day that just ended.
const RANGES = ['now', 'today', 'week', 'month'] as const
const MAX_TZ_MIN = 14 * 60

function rangeStart(range: string, tz: string | undefined, to: Date): Date {
  if (!(RANGES as readonly string[]).includes(range)) throw new BobConfigError('ventana inválida')
  if (range === 'now') return new Date(to.getTime() - BUCKET_MS)
  const offset = tz === undefined ? 0 : Number(tz)
  if (!Number.isInteger(offset) || Math.abs(offset) > MAX_TZ_MIN) throw new BobConfigError('ventana inválida')
  // Local wall-clock time, carried in the UTC fields of a Date.
  const local = new Date(to.getTime() - 1 - offset * 60_000)
  const day = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate())
  const start = range === 'today' ? day
    : range === 'week' ? day - local.getUTCDay() * 86_400_000
      : Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), 1)
  return new Date(start + offset * 60_000)
}

export function resolveWindow(q: Query, watermark: Date | null): { from: Date; to: Date } {
  const to = q.to ? new Date(q.to) : ceilToBucket(watermark ?? new Date())
  const from = q.from ? new Date(q.from) : q.range ? rangeStart(q.range, q.tz, to) : new Date(to.getTime() - 288 * BUCKET_MS)
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
    throw new BobConfigError('ventana inválida')
  }
  if (to.getTime() - from.getTime() > MAX_WINDOW_MS) throw new BobConfigError('ventana demasiado larga (máximo 31 días)')
  return { from, to }
}

export async function readPerformance(orgId: string, q: Query, source?: Pool): Promise<PerformanceRead> {
  return asBobApp(orgId, async (db) => {
    const scope = await readScope(db, q)
    const w = scope.window
    const [counts, responseTimes, presence] = [
      await readMetricCounts(db, w), await readResponseTimes(db, w), await readPresence(db, w),
    ]
    return { orgId, ...scope, counts, responseTimes, presence, cells: await readCellStates(db, orgId, w) }
  }, source)
}

export async function readInteractionDurations(db: PoolClient, w: Window): Promise<DurationByChannel[]> {
  const { rows } = await db.query(`
    SELECT channel_id, count(*)::int AS rows, sum(n) AS n, sum(sum_ms) AS sum_ms,
           count(*) FILTER (WHERE NOT sealed)::int AS open
      FROM bob.proj_durations
     WHERE measure = 'interaction_duration'
       AND bucket_start >= $1 AND bucket_start < $2 AND channel_id = ANY($3::uuid[])
     GROUP BY channel_id`, [w.from, w.to, w.channelIds])
  return rows.map((r) => ({
    channel_id: r.channel_id, rows: r.rows, n: num(r.n), sum_ms: num(r.sum_ms), open: r.open,
  }))
}

export async function readSentiment(db: PoolClient, w: Window): Promise<SentimentAggregate[]> {
  const { rows } = await db.query(`
    SELECT source, state, count(*)::int AS rows, sum(reading_count) AS readings,
           sum(closing_count) AS closings, count(*) FILTER (WHERE NOT sealed)::int AS open
      FROM bob.proj_sentiment
     WHERE bucket_start >= $1 AND bucket_start < $2 AND channel_id = ANY($3::uuid[])
     GROUP BY source, state`, [w.from, w.to, w.channelIds])
  return rows.map((r) => ({
    source: r.source, state: r.state, rows: r.rows,
    readings: num(r.readings), closings: num(r.closings), open: r.open,
  }))
}

export type InteractionsRead = Scope & { orgId: string; durations: DurationByChannel[]; cells: CellState[] | null }

export async function readInteractions(orgId: string, q: Query, source?: Pool): Promise<InteractionsRead> {
  return asBobApp(orgId, async (db) => {
    const scope = await readScope(db, q)
    const durations = await readInteractionDurations(db, scope.window)
    return { orgId, ...scope, durations, cells: await readCellStates(db, orgId, scope.window) }
  }, source)
}

export type QualityRead = Scope & {
  orgId: string; sentiment: SentimentAggregate[]; counts: CountAggregate[]; cells: CellState[] | null
}

export async function readQuality(orgId: string, q: Query, source?: Pool): Promise<QualityRead> {
  return asBobApp(orgId, async (db) => {
    const scope = await readScope(db, q)
    const sentiment = await readSentiment(db, scope.window)
    const counts = await readMetricCounts(db, scope.window)
    return { orgId, ...scope, sentiment, counts, cells: await readCellStates(db, orgId, scope.window) }
  }, source)
}
