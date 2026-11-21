// The Interactions and Quality screens of the demo, built from projection
// aggregates. Pure, like matrix.ts, and bound by the same rule (contract §5):
// a figure with no projection row is not a zero.
//
// Which declaration each figure needs follows the Slice 3 spec §4
// (BOb-engine, docs/slice-3-absent-not-zero.md). The states themselves are
// Slice 3's to resolve, in bob.v_cell_state; until that view exists this file
// only says what was read (no row, a written zero, a value), never more.
import {
  LABEL_FAILURE_ROWS, cellOf, countRow, declaredBy,
  type Cell, type Channel, type CountAggregate, type MatrixRow,
} from './matrix.ts'

// A figure of the demo that none of the eight projections carries.
export type NotProjection = { kind: 'not_projection'; note: string }

// ── Interactions: Sesiones, Canales, Tiempo Prom. ───────────────────────────

// proj_durations, measure = 'interaction_duration' (actor_type is always
// 'user', contract §6.3, O2), one aggregate per channel.
export type DurationByChannel = { channel_id: string; rows: number; n: number; sum_ms: number; open: number }

export type InteractionsScreen = {
  sessions: NotProjection
  avgDuration: Cell
  // How many conversations closed with a duration in the window: n.
  closed: Cell
  byChannel: { channel: Channel; avgDuration: Cell; closed: Cell }[]
  // Slice 3 §4: interaction duration requires a close (`resolution`).
  durationDeclaredBy: string[]
}

function durationCells(rows: number, n: number, sum_ms: number, open: number): { avg: Cell; closed: Cell } {
  if (rows === 0) return { avg: { kind: 'no_row' }, closed: { kind: 'no_row' } }
  if (n === 0) return { avg: { kind: 'zero', rows, open }, closed: { kind: 'zero', rows, open } }
  return {
    avg: { kind: 'value', value: sum_ms / n, rows, open, pct: null },
    closed: { kind: 'value', value: n, rows, open, pct: null },
  }
}

export function buildInteractions(durations: DurationByChannel[], channels: Channel[]): InteractionsScreen {
  const sum = (f: (d: DurationByChannel) => number) => durations.reduce((s, d) => s + f(d), 0)
  const total = durationCells(sum((d) => d.rows), sum((d) => d.n), sum((d) => d.sum_ms), sum((d) => d.open))
  return {
    sessions: {
      kind: 'not_projection',
      note: 'el contrato 0.5.3 no nombra una cifra de sesiones (session_count es el denominador de cada métrica)',
    },
    avgDuration: total.avg,
    closed: total.closed,
    byChannel: channels.map((channel) => {
      const d = durations.find((x) => x.channel_id === channel.id)
      const c = d ? durationCells(d.rows, d.n, d.sum_ms, d.open) : durationCells(0, 0, 0, 0)
      return { channel, avgDuration: c.avg, closed: c.closed }
    }),
    durationDeclaredBy: declaredBy({ kind: 'capability', capability: 'resolution' }, channels) ?? [],
  }
}

// ── Quality: NPS, Ánimo & Sentimiento (ORGA, MECA) ──────────────────────────

export const SENTIMENT_STATES = ['s0', 's1', 's2', 's3', 's4'] as const
export type SentimentState = (typeof SENTIMENT_STATES)[number]
export type SentimentSource = 'orga' | 'meca'

export type SentimentAggregate = {
  source: SentimentSource
  state: SentimentState
  rows: number
  readings: number
  closings: number
  open: number
}

export type SentimentPanel = {
  source: SentimentSource
  // Counts per state, never a sum of states (contract §6.2: ordinal).
  states: Record<SentimentState, Cell>
  total: Cell
  closings: Cell
  declaredBy: string[]
}

export type QualityScreen = {
  nps: NotProjection
  orga: SentimentPanel
  meca: SentimentPanel
  labelFailures: MatrixRow[]
}

// Slice 3 §4: ORGA needs orga_conversation, MECA needs meca_rum.
const SOURCE_CAPABILITY: Record<SentimentSource, string> = { orga: 'orga_conversation', meca: 'meca_rum' }

function panel(source: SentimentSource, aggs: SentimentAggregate[], channels: Channel[]): SentimentPanel {
  const mine = aggs.filter((a) => a.source === source)
  const sum = (f: (a: SentimentAggregate) => number) => mine.reduce((s, a) => s + f(a), 0)
  const readings = sum((a) => a.readings)
  const states = {} as Record<SentimentState, Cell>
  for (const st of SENTIMENT_STATES) {
    const a = mine.filter((x) => x.state === st)
    const rows = a.reduce((s, x) => s + x.rows, 0)
    states[st] = cellOf(rows, a.reduce((s, x) => s + x.readings, 0), a.reduce((s, x) => s + x.open, 0), readings)
  }
  const rows = sum((a) => a.rows)
  const open = sum((a) => a.open)
  return {
    source,
    states,
    total: cellOf(rows, readings, open, null),
    closings: source === 'orga' ? cellOf(rows, sum((a) => a.closings), open, null) : { kind: 'no_row' },
    declaredBy: declaredBy({ kind: 'capability', capability: SOURCE_CAPABILITY[source] }, channels) ?? [],
  }
}

export function buildQuality(
  sentiment: SentimentAggregate[], counts: CountAggregate[], channels: Channel[],
): QualityScreen {
  return {
    nps: { kind: 'not_projection', note: 'ninguna de las ocho proyecciones lo lleva' },
    orga: panel('orga', sentiment, channels),
    meca: panel('meca', sentiment, channels),
    labelFailures: LABEL_FAILURE_ROWS.map((spec) => countRow(spec, counts, channels, ['user'])),
  }
}
