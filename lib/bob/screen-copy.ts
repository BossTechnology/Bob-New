// What the three /bob screens say, by audience. Pure: no React, no database.
//
// Henry, 2026-11-27 («oculta la jerga a los viewers para el lunes»): a viewer
// sees client language: no organization id, no table or column names, no
// capability names, no watermark, no Slice 3 vocabulary. Admin and analyst
// keep the technical reading as it was. Only the words change: every figure,
// every state and every "no row is not a zero" stays what it is.
//
// The audience comes from the account's role in BOb (roles.ts in the box, the
// app_role claim outside it). Anything that is not admin or analyst reads as a
// viewer, so an unknown role never sees the technical text.
import type { Cell, MatrixRow } from './matrix.ts'
import { STATE_LABEL, reasonSummary, stateTitle } from './cell-state.ts'
import type { NotProjection, SentimentState } from './screens.ts'

export type Audience = 'viewer' | 'technical'

export function audienceFor(role: string | null | undefined): Audience {
  return role === 'admin' || role === 'analyst' ? 'technical' : 'viewer'
}

// ── Cells ────────────────────────────────────────────────────────────────────

// How one cell is painted: a tone (the CSS class), its text, an optional
// tooltip, and the provisional mark and share when they apply.
export type Tone = 'value' | 'zero' | 'noRow' | 'notConfigured' | 'empty'
export type Paint = {
  tone: Tone
  text: string
  title?: string
  label?: string
  open?: string
  share?: string
}

export type CellFormat = { format?: (v: number) => string; unit?: string; pct?: boolean }

// One word, one meaning, for the viewer (review of PR #66):
//   «—»             nothing was recorded in the period;
//   «No activo»     the measurement is not switched on for the chosen channels;
//   «No disponible» BOb does not measure this figure yet;
//   «Pendiente»     the period is still closing.
export const VIEWER_WORD = {
  none: '—',
  inactive: 'No activo',
  unavailable: 'No disponible',
  pending: 'Pendiente',
} as const
const VIEWER_NONE = 'No hay registros en este periodo.'
const VIEWER_PROVISIONAL = 'Cifra provisional: el periodo aún no cierra.'

export function paintCell(cell: Cell, a: Audience, f: CellFormat = {}): Paint {
  const unit = f.unit ?? ''
  const format = f.format ?? ((v: number) => `${v}${unit}`)
  const tech = a === 'technical'
  const st = cell.state
  if (st && st.state !== 'observed') {
    const title = tech ? stateTitle(st) : undefined
    switch (st.state) {
      case 'not_applicable':
        return { tone: 'empty', text: '', title, label: tech ? STATE_LABEL.not_applicable : undefined }
      case 'not_configured':
        return tech
          ? { tone: 'notConfigured', text: reasonSummary(st.reasons) || STATE_LABEL.not_configured, title }
          : { tone: 'notConfigured', text: VIEWER_WORD.inactive }
      case 'pending':
        return { tone: 'noRow', text: STATE_LABEL.pending, title: tech ? title : 'El periodo aún se está cerrando.' }
      default:
        return tech
          ? { tone: 'noRow', text: '—', title, label: STATE_LABEL[st.state] }
          : { tone: 'noRow', text: VIEWER_WORD.none, title: VIEWER_NONE }
    }
  }
  // Observed with no row: a declared-absent actor, a zero by declaration (F-32).
  // Not formatted: for durations the rollup's value is the sample count, not a time.
  if (st && cell.kind === 'no_row') {
    return { tone: 'zero', text: `${st.value ?? 0}${unit}`, title: tech ? stateTitle(st) : undefined }
  }
  if (cell.kind === 'no_row') {
    return tech
      ? { tone: 'noRow', text: 'sin fila', title: 'sin fila de proyección' }
      : { tone: 'noRow', text: VIEWER_WORD.none, title: VIEWER_NONE }
  }
  const open = cell.open > 0 ? (tech ? `${cell.open} de ${cell.rows} filas sin sellar` : VIEWER_PROVISIONAL) : undefined
  if (cell.kind === 'zero') {
    return { tone: 'zero', text: `0${unit}`, title: tech ? `${cell.rows} filas, todas en cero` : undefined, open }
  }
  return {
    tone: 'value',
    text: format(cell.value),
    title: tech ? `${cell.rows} filas` : undefined,
    open,
    share: f.pct && cell.pct !== null ? ` ${Math.round(cell.pct * 100)}%` : undefined,
  }
}

// A figure no projection carries.
export function paintNoProjection(np: NotProjection, a: Audience): Paint {
  return a === 'technical'
    ? { tone: 'noRow', text: 'sin proyección', title: np.note }
    : { tone: 'noRow', text: VIEWER_WORD.unavailable }
}

// A cell that has no meaning for its row (MECA has no conversation close).
export function paintNotApplicable(a: Audience): Paint {
  return a === 'technical' ? { tone: 'noRow', text: 'no aplica' } : { tone: 'empty', text: '' }
}

// ── Lines under a metric's name ──────────────────────────────────────────────

// A gray note (`tone: 'source'`) or a red warning (`tone: 'notConfigured'`).
export type Note = { tone: 'source' | 'notConfigured'; text: string }

// What a viewer reads when no selected channel can produce the figure.
export function viewerNoData(selectedCount: number): string {
  return `${VIEWER_WORD.inactive} ${selectedCount === 1 ? 'en este canal' : 'en estos canales'}`
}

// Under a Performance row: where the figure comes from (technical), or only
// that the selection cannot produce it (viewer).
export function rowSource(row: MatrixRow, a: Audience, selectedCount: number): Note | null {
  const s = row.spec.source
  const tech = a === 'technical'
  const extra = row.spec.note ? ` · ${row.spec.note}` : ''
  if (s.kind === 'not_projection') return tech ? { tone: 'source', text: s.note + extra } : null
  if (s.kind === 'unnamed') {
    return tech ? { tone: 'source', text: `${row.spec.table}.${row.spec.metric} · el contrato no nombra capacidad${extra}` } : null
  }
  const what = s.kind === 'capability' ? `capacidad ${s.capability}` : 'idle_bound_seconds'
  const by = row.declaredBy ?? []
  if (by.length === 0) {
    return { tone: 'notConfigured', text: tech ? `${what}: no configurado en la selección${extra}` : viewerNoData(selectedCount) }
  }
  return tech ? { tone: 'source', text: `${what}: ${by.join(', ')}${extra}` } : null
}

// Who declares what a figure needs (Interactions, Quality).
export function declared(what: string, by: string[], a: Audience, selectedCount: number): Note | null {
  if (by.length === 0) {
    return { tone: 'notConfigured', text: a === 'technical' ? `${what}: no configurado en la selección` : viewerNoData(selectedCount) }
  }
  return a === 'technical' ? { tone: 'source', text: `${what}: ${by.join(', ')}` } : null
}

// A fixed technical note: shown to the technical audience only.
export const techNote = (text: string, a: Audience): Note | null => (a === 'technical' ? { tone: 'source', text } : null)

// ── Header ───────────────────────────────────────────────────────────────────

export type Screen = 'performance' | 'interactions' | 'quality'

const TITLE: Record<Screen, Record<Audience, string>> = {
  performance: { technical: 'RENDIMIENTO · proyecciones reales (bob_app)', viewer: 'Rendimiento' },
  interactions: { technical: 'INTERACCIONES · proyecciones reales (bob_app)', viewer: 'Interacciones' },
  quality: { technical: 'CALIDAD Y EXPERIENCIA · proyecciones reales (bob_app)', viewer: 'Calidad y experiencia' },
}

export const screenTitle = (s: Screen, a: Audience) => TITLE[s][a]

// A read error's label and sentence. Our configuration messages are safe to
// show, but they name tables and fields: the viewer gets one plain sentence.
export function readError(s: Screen, a: Audience, configMessage: string | null) {
  if (a === 'technical') {
    return {
      label: `${TITLE[s].technical.split(' · ')[0]} · proyecciones`,
      message: configMessage ?? 'No se pudieron leer las proyecciones.',
    }
  }
  return { label: TITLE[s].viewer, message: 'No se pudieron leer los datos. Vuelve a intentarlo en un momento.' }
}

// The window, readable: "27 nov 2026, 10:00 → 27 nov 2026, 11:00". Without a
// time zone it is the runtime's own (the browser's, in LocalWindow).
export function formatWindow(from: Date, to: Date, timeZone?: string): string {
  const f = new Intl.DateTimeFormat('es', { dateStyle: 'medium', timeStyle: 'short', timeZone })
  return `${f.format(from)} → ${f.format(to)}`
}

// The technical meta line, as it was: ISO instants, and the organization and
// watermark where the screen showed them.
export function technicalMeta(w: { from: Date; to: Date }, o: { orgId?: string; watermark?: Date | null | false }) {
  const parts: { label: string; value: string }[] = []
  if (o.orgId) parts.push({ label: 'org', value: o.orgId })
  parts.push({ label: 'ventana', value: `${w.from.toISOString()} → ${w.to.toISOString()}` })
  if (o.watermark !== false && o.watermark !== undefined) {
    parts.push({ label: 'watermark', value: o.watermark ? new Date(o.watermark).toISOString() : 'sin filas' })
  }
  return parts
}

// ── Section labels and legends ───────────────────────────────────────────────

export function labelFailuresTitle(a: Audience): string {
  return a === 'technical' ? 'Turnos sin etiqueta · proj_metric_counts' : 'Turnos sin clasificar'
}

export function sentimentTitle(a: Audience): string {
  return a === 'technical' ? 'Ánimo & Sentimiento · proj_sentiment (lecturas por estado)' : 'Ánimo y sentimiento'
}

// One legend item: a sample painted in a tone, then its meaning.
export type LegendItem = { sample?: { tone: Tone | 'sup'; text: string }; text: string }

// The viewer's legend names only what the screen can paint: «Pendiente» only
// where Slice 3 states are read, «No disponible» only where a figure has no
// measurement behind it, the share only where there are shares.
export function viewerLegend(o: { pending: boolean; unavailable: boolean; share?: string; extra?: string }): LegendItem[] {
  const items: LegendItem[] = [
    { sample: { tone: 'noRow', text: VIEWER_WORD.none }, text: 'no hay registros en este periodo' },
    { sample: { tone: 'zero', text: '0' }, text: 'hubo actividad y suma cero' },
    { sample: { tone: 'notConfigured', text: VIEWER_WORD.inactive }, text: 'la medición no está activada en los canales elegidos' },
  ]
  if (o.unavailable) items.push({ sample: { tone: 'noRow', text: VIEWER_WORD.unavailable }, text: 'BOb todavía no mide esta cifra' })
  if (o.pending) items.push({ sample: { tone: 'noRow', text: VIEWER_WORD.pending }, text: 'el periodo aún se está cerrando' })
  items.push({ sample: { tone: 'sup', text: '*' }, text: 'cifra provisional' })
  if (o.share) items.push({ text: o.share })
  if (o.extra) items.push({ text: o.extra })
  return items
}

export function performanceLegend(a: Audience, slice3: boolean): LegendItem[] {
  if (a === 'viewer') return viewerLegend({ pending: slice3, unavailable: true, share: '% = parte del total de la fila' })
  return [
    { sample: { tone: 'noRow', text: 'sin fila' }, text: 'ninguna fila de proyección en la ventana' },
    { sample: { tone: 'noRow', text: 'sin proyección' }, text: 'la fila de la demo no tiene tabla detrás' },
    { sample: { tone: 'zero', text: '0' }, text: 'hay filas y suman cero' },
    { sample: { tone: 'notConfigured', text: 'no configurado' }, text: 'ningún canal de la selección declara lo que la fila necesita' },
    { sample: { tone: 'sup', text: '*' }, text: 'incluye buckets sin sellar' },
    { text: '% = parte del total de la fila' },
  ]
}

export function qualityLegend(a: Audience, slice3: boolean): LegendItem[] {
  if (a === 'viewer') {
    return viewerLegend({
      pending: slice3, unavailable: true,
      share: '% = parte de las lecturas de esa fuente', extra: 'ORGA y MECA se muestran por separado.',
    })
  }
  return [
    { sample: { tone: 'noRow', text: 'sin fila' }, text: 'ninguna fila en la ventana' },
    { sample: { tone: 'zero', text: '0' }, text: 'hay filas y suman cero' },
    { text: '% = parte de las lecturas de esa fuente' },
    { sample: { tone: 'sup', text: '*' }, text: 'incluye buckets sin sellar' },
    { text: 'ORGA y MECA no se mezclan: la mezcla depende del peso mecánico configurado y se calcula al leer.' },
  ]
}

// Interactions has no legend of its own; the viewer gets one.
export function interactionsLegend(a: Audience, slice3: boolean): LegendItem[] | null {
  return a === 'viewer' ? viewerLegend({ pending: slice3, unavailable: true }) : null
}

// The five sentiment states are ordinal (contract §6.2). The viewer reads
// them with the simulator's own names (public/dashboard.html, T.es.sent).
const SENTIMENT_LABEL: Record<SentimentState, string> = {
  s0: 'Enojado', s1: 'Insatisfecho', s2: 'Satisfecho', s3: 'Contento', s4: 'Feliz',
}
export const sentimentLabel = (st: SentimentState, a: Audience) => (a === 'technical' ? st : SENTIMENT_LABEL[st])

// Slice 3's note: technical only. The viewer's legend already says what each
// state means.
export function sliceThreeNote(a: Audience, present: boolean): LegendItem[] | null {
  if (a === 'viewer') return null
  if (!present) {
    return [{ text: 'Estados del Slice 3 pendientes (bob.bob_cell_rollup no existe en esta base): se pinta lo que se leyó, sin inventar estados.' }]
  }
  return [
    { text: 'Estados del Slice 3 (bob.bob_cell_rollup):' },
    { sample: { tone: 'empty', text: 'No aplica' }, text: 'vacío' },
    { sample: { tone: 'notConfigured', text: 'No configurado' }, text: 'falta una declaración' },
    { sample: { tone: 'noRow', text: 'Pendiente' }, text: 'el bucket aún no sella' },
    { sample: { tone: 'zero', text: '—' }, text: 'no observado' },
    { text: 'una cifra (también 0): observado' },
    { sample: { tone: 'sup', text: '*' }, text: 'provisional. Pasa el cursor para ver el motivo.' },
  ]
}

// The tables only the technical audience sees: the selected channels with
// their declarations, and the eight projections' presence.
export const showsTechnicalTables = (a: Audience) => a === 'technical'

// The demo row no projection carries, in the Performance matrix.
export function paintNoTable(a: Audience): Paint {
  return a === 'technical'
    ? { tone: 'noRow', text: 'sin proyección', title: 'ninguna de las ocho tablas lo lleva' }
    : { tone: 'noRow', text: 'No disponible' }
}
