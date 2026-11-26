// Slice 3 (BOb-engine, docs/slice-3-absent-not-zero.md): the cell states.
//
// The states (not_applicable, not_configured, pending, not_observed, observed)
// and their reasons are resolved in the database, by bob.bob_cell_state and
// rolled up over channels and time by bob.bob_cell_rollup: one implementation
// for every consumer (SR-2). This file reads the rollup and paints it: state ->
// painting, reason -> sentence (§7, "the application only paints").
//
// Until the functions exist on the database this app reads, readCellStates
// returns null and the screens keep painting what they read (no row, a written
// zero, a value), saying that the states are pending.
import type { PoolClient } from 'pg'

export const CELL_STATES = ['not_applicable', 'not_configured', 'pending', 'not_observed', 'observed'] as const
export type CellStateName = (typeof CELL_STATES)[number]

export type Coverage = {
  n: number
  m: number
  excluded: { channel_id: string; state: CellStateName; reasons: string[] }[]
}

// One row of bob.bob_cell_rollup: per (metric, actor_type) over the selection
// and the window. actor_type is null for the channel figures (sentiment, health).
export type CellState = {
  metric: string
  actor_type: string | null
  state: CellStateName
  reasons: string[]
  value: number | null
  provisional: boolean
  coverage: Coverage
}

// What a painted cell carries from Slice 3.
export type StateInfo = Pick<CellState, 'state' | 'reasons' | 'provisional' | 'coverage' | 'value'>

const ROLLUP = 'bob.bob_cell_rollup(uuid, uuid[], timestamptz, timestamptz)'

export async function hasCellStates(db: PoolClient): Promise<boolean> {
  const { rows } = await db.query('SELECT to_regprocedure($1) IS NOT NULL AS present', [ROLLUP])
  return rows[0]?.present === true
}

// The rollup over [from, to) for the selected channels, or null when this
// database does not have Slice 3 yet. Runs inside the caller's bob_app
// transaction, so RLS and the org claim apply.
export async function readCellStates(
  db: PoolClient, orgId: string, w: { from: Date; to: Date; channelIds: string[] },
): Promise<CellState[] | null> {
  if (!(await hasCellStates(db))) return null
  const { rows } = await db.query(`
    SELECT metric, actor_type, state, reasons, value, provisional, coverage
      FROM bob.bob_cell_rollup($1::uuid, $2::uuid[], $3, $4)`,
  [orgId, w.channelIds, w.from, w.to])
  return rows.map((r) => ({
    metric: r.metric,
    actor_type: r.actor_type,
    state: r.state,
    reasons: r.reasons ?? [],
    value: r.value === null ? null : Number(r.value),
    provisional: r.provisional === true,
    coverage: r.coverage,
  }))
}

export function stateOf(
  cells: CellState[] | null, metric: string | undefined, actor: string | null,
): StateInfo | undefined {
  if (!cells || !metric) return undefined
  const c = cells.find((x) => x.metric === metric && x.actor_type === actor)
  if (!c) return undefined
  return { state: c.state, reasons: c.reasons, provisional: c.provisional, coverage: c.coverage, value: c.value }
}

// One channel's standing inside a rollup: excluded channels carry their own
// state and reasons; a selected channel that is not excluded is observed.
export function stateForChannel(info: StateInfo | undefined, channelId: string): StateInfo | undefined {
  if (!info) return undefined
  const ex = info.coverage.excluded.find((e) => e.channel_id === channelId)
  if (ex) return { state: ex.state, reasons: ex.reasons, provisional: false, coverage: { n: 0, m: 1, excluded: [ex] }, value: null }
  if (info.coverage.n === 0) return undefined
  return { state: 'observed', reasons: [], provisional: info.provisional, coverage: { n: 1, m: 1, excluded: [] }, value: null }
}

// ── Painting: state -> label, reason -> sentence ─────────────────────────────

// CONTEXT.md names. not_observed is painted as the em dash (G14, D-14).
export const STATE_LABEL: Record<CellStateName, string> = {
  not_applicable: 'No aplica',
  not_configured: 'No configurado',
  pending: 'Pendiente',
  not_observed: 'No observado',
  observed: 'Observado',
}

const CAPABILITY_LABEL: Record<string, string> = {
  orga_conversation: 'conversación (ORGA)', meca_rum: 'RUM (MECA)', response_time: 'tiempo de respuesta',
  resolution: 'resolución', coherence: 'coherencia', hallucination: 'alucinación',
  health_latency: 'latencia', health_errors: 'errores', health_uptime: 'disponibilidad',
  health_disconnects: 'desconexiones', disambiguation: 'desambiguación', escalation: 'derivación', queue: 'cola',
}

const REASON_TEXT: Record<string, string> = {
  telemetry_not_started: 'La organización todavía no empezó a enviar telemetría.',
  source_key_unset: 'El canal no tiene source_key: nada puede llegar.',
  mix_not_declared: 'El canal no declara qué actores tiene (channel_actor_mix).',
  idle_bound_not_declared: 'El canal no declara idle_bound_seconds.',
  no_ground_truth: 'No hay conocimiento de referencia contra el cual medirlo.',
  actor_not_present: 'El canal declara que este actor no está: cero por declaración.',
  lag_not_declared: 'El canal no declara su lag: sus buckets nunca sellan.',
  not_sealed: 'El bucket todavía no está sellado.',
  no_liveness: 'Sin fila y sin evidencia de que el canal estuviera vivo.',
  none_observed: 'Observado: ninguno.',
  no_channels_selected: 'No hay canales seleccionados.',
}

export function reasonText(reason: string): string {
  if (REASON_TEXT[reason]) return REASON_TEXT[reason]
  const [code, arg] = reason.split(':', 2)
  if (code === 'capability_not_declared') return `Ningún canal declara la capacidad ${CAPABILITY_LABEL[arg] ?? arg}.`
  if (code === 'no_definition') return `La cifra no tiene definición hasta que se decida ${arg}.`
  return reason
}

// The interface shows the first reason and "and N more" (§2, G5).
export function reasonSummary(reasons: string[]): string {
  if (reasons.length === 0) return ''
  const more = reasons.length > 1 ? ` (y ${reasons.length - 1} más)` : ''
  return reasonText(reasons[0]) + more
}

// The full cause, for a tooltip: every reason, then the coverage when some
// selected channel did not contribute (F-30).
export function stateTitle(info: StateInfo): string {
  const lines = [STATE_LABEL[info.state], ...info.reasons.map(reasonText)]
  if (info.coverage.m > 1 && info.coverage.excluded.length > 0) {
    lines.push(`${info.coverage.n} de ${info.coverage.m} canales observados`)
  }
  if (info.provisional) lines.push('Incluye buckets sin sellar.')
  return lines.join('\n')
}
