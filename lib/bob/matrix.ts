// The Performance matrix, built from projection aggregates.
//
// Pure: no database. lib/bob/projection-reader.ts reads the rows and hands
// them here. The one rule this file exists to keep is contract §5: a cell with
// no projection row is NOT a zero. The cell's state (Slice 3) is resolved in
// the database by bob.bob_cell_rollup and attached here as it comes; nothing
// in this file decides a state.
import { stateOf, type CellState, type StateInfo } from './cell-state.ts'

export const DEMO_ACTORS = ['user', 'asa', 'human'] as const
export type ActorType = 'user' | 'asa' | 'human' | 'arep'

export const ACTOR_LABEL: Record<ActorType, string> = {
  user: 'Cliente',
  asa: 'Agente IA',
  human: 'Agente humano',
  arep: 'AREP',
}

// One aggregate per (key, actor_type), as the reader returns it. `rows` is
// how many projection rows were summed; `open` how many of them are unsealed.
export type CountAggregate = {
  key: string
  actor_type: ActorType
  rows: number
  value: number
  open: number
}

export type DurationAggregate = {
  actor_type: ActorType
  rows: number
  n: number
  sum_ms: number
  open: number
}

// What was read from the projections, plus the Slice 3 state when the
// database has it. The figure is shown only when the state is observed.
export type Cell = (
  | { kind: 'no_row' }
  | { kind: 'zero'; rows: number; open: number }
  | { kind: 'value'; value: number; rows: number; open: number; pct: number | null }
) & { state?: StateInfo }

export type Channel = {
  id: string
  name: string
  type: string
  lag_seconds: number | null
  idle_bound_seconds: number | null
  capabilities: string[]
}

// What the contract says decides whether a row is configured on a channel.
export type Source =
  | { kind: 'capability'; capability: string } // §9.1
  | { kind: 'declaration'; field: 'idle_bound_seconds' } // §9.2
  | { kind: 'unnamed' } // the contract names no capability for it
  | { kind: 'not_projection'; note: string } // the demo row has no proj_* behind it

export type RowSpec = {
  id: string
  label: string
  table: 'proj_metric_counts' | 'proj_durations' | null
  metric?: string
  source: Source
  note?: string
}

// The demo's RENDIMIENTO rows, in its order, then what the contract adds.
export const MATRIX_ROWS: RowSpec[] = [
  {
    id: 'available', label: 'Disponibles', table: null,
    source: { kind: 'not_projection', note: 'estado vivo (v_roster), no una proyección' },
  },
  {
    id: 'response_time', label: 'Tiempo de respuesta', table: 'proj_durations',
    metric: 'response_time', source: { kind: 'capability', capability: 'response_time' },
  },
  {
    id: 'quality', label: 'Calidad de respuesta', table: null, metric: 'response_quality',
    source: { kind: 'not_projection', note: 'ninguna de las ocho la lleva (coherence, diferida)' },
  },
  {
    id: 'resolved', label: 'Resueltos', table: 'proj_metric_counts', metric: 'resolved',
    source: { kind: 'capability', capability: 'resolution' },
  },
  {
    id: 'abandoned', label: 'Abandonados', table: 'proj_metric_counts', metric: 'abandoned',
    source: { kind: 'declaration', field: 'idle_bound_seconds' },
  },
  {
    id: 'disambiguation', label: 'Desambiguación', table: 'proj_metric_counts',
    metric: 'disambiguation', source: { kind: 'unnamed' },
  },
  {
    id: 'escalations', label: 'Derivaciones', table: 'proj_metric_counts',
    metric: 'escalations', source: { kind: 'unnamed' },
  },
  {
    id: 'hallucinations', label: 'Alucinaciones', table: 'proj_metric_counts',
    metric: 'hallucinations', source: { kind: 'capability', capability: 'hallucination' },
    note: 'el contrato la muestra como «Unfounded claims»',
  },
  {
    id: 'abandoned_in_queue', label: 'Abandonados en cola', table: 'proj_metric_counts',
    metric: 'abandoned_in_queue', source: { kind: 'unnamed' },
    note: 'en el contrato, no en la demo; solo user',
  },
]

// Customer turns the classifier did not label (§6.1, §4.1). Not matrix rows
// in the demo; shown apart because they are the clearest case of a written 0.
export const LABEL_FAILURE_ROWS: RowSpec[] = [
  { id: 'abstained', label: 'Abstenciones', table: 'proj_metric_counts', metric: 'abstained',
    source: { kind: 'capability', capability: 'orga_conversation' } },
  { id: 'classifier_down', label: 'Clasificador caído', table: 'proj_metric_counts',
    metric: 'classifier_down', source: { kind: 'capability', capability: 'orga_conversation' } },
  { id: 'label_missing', label: 'Etiqueta perdida', table: 'proj_metric_counts',
    metric: 'label_missing', source: { kind: 'capability', capability: 'orga_conversation' } },
]

// A single cell. No aggregate means no row: never 0.
export function cellOf(rows: number, value: number, open: number, total: number | null): Cell {
  if (rows === 0) return { kind: 'no_row' }
  if (value === 0) return { kind: 'zero', rows, open }
  return { kind: 'value', value, rows, open, pct: total && total > 0 ? value / total : null }
}

export type MatrixRow = {
  spec: RowSpec
  total: Cell
  cells: Record<ActorType, Cell>
  // Channels in the selection that declare what this row needs. Empty means
  // not configured on any selected channel. null when the contract names nothing.
  declaredBy: string[] | null
}

export function actorsFor(aggregates: { actor_type: ActorType }[]): ActorType[] {
  const seen = new Set(aggregates.map((a) => a.actor_type))
  return seen.has('arep') ? [...DEMO_ACTORS, 'arep'] : [...DEMO_ACTORS]
}

export function declaredBy(source: Source, channels: Channel[]): string[] | null {
  switch (source.kind) {
    case 'capability':
      return channels.filter((c) => c.capabilities.includes(source.capability)).map((c) => c.name)
    case 'declaration':
      return channels.filter((c) => c.idle_bound_seconds !== null).map((c) => c.name)
    default:
      return null
  }
}

const NO_ROW: Cell = { kind: 'no_row' }

export function countRow(
  spec: RowSpec, aggregates: CountAggregate[], channels: Channel[], actors: ActorType[],
): MatrixRow {
  const mine = aggregates.filter((a) => a.key === spec.metric)
  const sum = (f: (a: CountAggregate) => number) => mine.reduce((s, a) => s + f(a), 0)
  const total = sum((a) => a.value)
  const cells = {} as Record<ActorType, Cell>
  for (const actor of actors) {
    const a = mine.find((x) => x.actor_type === actor)
    cells[actor] = a ? cellOf(a.rows, a.value, a.open, total) : NO_ROW
  }
  return {
    spec,
    total: cellOf(sum((a) => a.rows), total, sum((a) => a.open), null),
    cells,
    declaredBy: declaredBy(spec.source, channels),
  }
}

// Response time: the cell value is the mean in ms, sum_ms / n (§6.3). The
// histogram is merged per actor and never across actors, so the total is the
// count of responses only, not a mean.
export function durationRow(
  spec: RowSpec, aggregates: DurationAggregate[], channels: Channel[], actors: ActorType[],
): MatrixRow {
  const cells = {} as Record<ActorType, Cell>
  for (const actor of actors) {
    const a = aggregates.find((x) => x.actor_type === actor)
    if (!a || a.rows === 0) cells[actor] = NO_ROW
    else if (a.n === 0) cells[actor] = { kind: 'zero', rows: a.rows, open: a.open }
    else cells[actor] = { kind: 'value', value: a.sum_ms / a.n, rows: a.rows, open: a.open, pct: null }
  }
  const rows = aggregates.reduce((s, a) => s + a.rows, 0)
  const n = aggregates.reduce((s, a) => s + a.n, 0)
  const open = aggregates.reduce((s, a) => s + a.open, 0)
  return {
    spec,
    total: cellOf(rows, n, open, null),
    cells,
    declaredBy: declaredBy(spec.source, channels),
  }
}

export function emptyRow(spec: RowSpec, channels: Channel[], actors: ActorType[]): MatrixRow {
  const cells = {} as Record<ActorType, Cell>
  for (const actor of actors) cells[actor] = NO_ROW
  return { spec, total: NO_ROW, cells, declaredBy: declaredBy(spec.source, channels) }
}

// Attaches the rollup's state to each actor cell of a row. The row total has
// no rollup of its own (bob_cell_rollup is per actor type), so it carries the
// actor states as they are: observed if any actor is, otherwise the first of
// them in §2's order. That mirrors the rollup over channels; see the PR note.
export function withStates(row: MatrixRow, actors: ActorType[], cells: CellState[] | null): MatrixRow {
  if (!cells || !row.spec.metric) return row
  const out = { ...row, cells: { ...row.cells } }
  const infos: StateInfo[] = []
  for (const a of actors) {
    const info = stateOf(cells, row.spec.metric, a)
    if (info) { out.cells[a] = { ...out.cells[a], state: info }; infos.push(info) }
  }
  const total = totalState(infos)
  if (total) out.total = { ...out.total, state: total }
  return out
}

const RANK = ['not_applicable', 'not_configured', 'pending', 'not_observed', 'observed'] as const

export function totalState(infos: StateInfo[]): StateInfo | undefined {
  const counted = infos.filter((i) => i.state !== 'not_applicable')
  const pool = counted.length ? counted : infos
  if (!pool.length) return undefined
  const observed = pool.filter((i) => i.state === 'observed')
  if (observed.length) {
    return {
      state: 'observed', reasons: [], provisional: observed.some((i) => i.provisional),
      coverage: observed[0].coverage, value: observed.reduce((s, i) => s + (i.value ?? 0), 0),
    }
  }
  return [...pool].sort((a, b) => RANK.indexOf(a.state) - RANK.indexOf(b.state))[0]
}

export function buildMatrix(
  counts: CountAggregate[], durations: DurationAggregate[], channels: Channel[],
  cells: CellState[] | null = null,
): { actors: ActorType[]; rows: MatrixRow[]; labelFailures: MatrixRow[] } {
  const actors = actorsFor([...counts, ...durations])
  const build = (spec: RowSpec) => withStates(
    spec.table === 'proj_metric_counts' ? countRow(spec, counts, channels, actors)
      : spec.table === 'proj_durations' ? durationRow(spec, durations, channels, actors)
        : emptyRow(spec, channels, actors),
    actors, cells)
  return {
    actors,
    rows: MATRIX_ROWS.map(build),
    labelFailures: LABEL_FAILURE_ROWS.map(build),
  }
}

// Five-minute UTC grain (contract §3).
export const BUCKET_MS = 300_000
export function ceilToBucket(t: Date): Date {
  return new Date(Math.ceil(t.getTime() / BUCKET_MS) * BUCKET_MS)
}
