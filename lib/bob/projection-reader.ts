// Reads BOb's projections for the Performance matrix.
//
// P5 §3.3 and §3.4: the application reads as `bob_app`, under the claim of one
// `org_id`, and never with the service role. Every read here runs in one
// read-only transaction that switches to `bob_app` and sets the claim, so the
// tenant policy (`org_id = (auth.jwt() ->> 'org_id')::uuid`) applies to every
// row returned. If the role switch does not hold, nothing is read.
//
// BOB_DATABASE_URL is server-only: the box's `bob/app.env`, or locally the
// BOb-engine Supabase stack. BOB_ORG_ID is the box's single organisation
// (P5, one organisation per box; Q6 keeps it as provisioning configuration).
import { Pool, type PoolClient } from 'pg'
import {
  BUCKET_MS, ceilToBucket,
  type ActorType, type Channel, type CountAggregate, type DurationAggregate,
} from './matrix.ts'

export class BobConfigError extends Error {}

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

let pool: Pool | null = null
function getPool(): Pool {
  const url = process.env.BOB_DATABASE_URL
  if (!url) throw new BobConfigError('BOB_DATABASE_URL no está definida')
  pool ??= new Pool({ connectionString: url, max: 4 })
  return pool
}

export function boxOrgId(): string {
  const id = process.env.BOB_ORG_ID
  if (!id || !/^[0-9a-f-]{36}$/i.test(id)) throw new BobConfigError('BOB_ORG_ID no está definida o no es un UUID')
  return id
}

// One transaction as bob_app under the tenant's claim. Exported for tests.
export async function asBobApp<T>(
  orgId: string, fn: (db: PoolClient) => Promise<T>, source: Pool = getPool(),
): Promise<T> {
  const db = await source.connect()
  try {
    await db.query('BEGIN READ ONLY')
    await db.query('SET LOCAL ROLE bob_app')
    await db.query("SELECT set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ org_id: orgId, role: 'bob_app' })])
    const { rows } = await db.query('SELECT current_user AS u')
    if (rows[0]?.u !== 'bob_app') throw new Error(`lectura como ${rows[0]?.u}, no como bob_app`)
    const out = await fn(db)
    await db.query('COMMIT')
    return out
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    db.release()
  }
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
}

export async function readPerformance(
  orgId: string,
  q: { from?: string; to?: string; channel?: string },
  source?: Pool,
): Promise<PerformanceRead> {
  return asBobApp(orgId, async (db) => {
    const channels = await readChannels(db)
    const selected = q.channel ? channels.filter((c) => c.id === q.channel) : channels
    const watermark = await readWatermark(db)
    const to = q.to ? new Date(q.to) : ceilToBucket(watermark ?? new Date())
    const from = q.from ? new Date(q.from) : new Date(to.getTime() - 288 * BUCKET_MS)
    if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime()) || from >= to) {
      throw new BobConfigError('ventana inválida')
    }
    const w: Window = { from, to, channelIds: selected.map((c) => c.id) }
    const [counts, responseTimes, presence] = [
      await readMetricCounts(db, w), await readResponseTimes(db, w), await readPresence(db, w),
    ]
    return { orgId, channels, selected, window: w, watermark, counts, responseTimes, presence }
  }, source)
}
