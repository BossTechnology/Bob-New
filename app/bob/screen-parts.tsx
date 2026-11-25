// Pieces the three /bob screens share. Painting only: no rule lives here.
import Link from 'next/link'
import type { Cell, Channel } from '@/lib/bob/matrix.ts'
import type { NotProjection } from '@/lib/bob/screens.ts'
import { STATE_LABEL, reasonSummary, stateTitle, type StateInfo } from '@/lib/bob/cell-state.ts'
import styles from './performance/matrix.module.css'
import { SignOut } from './sign-out'

const SCREENS = [
  ['performance', 'Rendimiento'], ['interactions', 'Interacciones'], ['quality', 'Calidad'],
] as const

export function ScreenNav({ current }: { current: (typeof SCREENS)[number][0] }) {
  return (
    <nav className={styles.channels}>
      {SCREENS.map(([id, label]) => (
        <Link key={id} href={`/bob/${id}`} className={id === current ? styles.on : undefined}>{label}</Link>
      ))}
      <SignOut />
    </nav>
  )
}

export function Unavailable() {
  return (
    <main className={styles.page}>
      <p className={styles.error}>La identidad de la caja o su base no responde. BOb no sirve nada hasta que vuelva.</p>
    </main>
  )
}

// No row in bob.users, or inactive (Henry, 2026-11-21). The proxy already
// answers 403; this is what a page says if it is reached anyway.
export function Forbidden() {
  return (
    <main className={styles.page}>
      <p className={styles.error}>Esta cuenta no tiene acceso a BOb en esta caja.</p>
    </main>
  )
}

export function ReadError({ label, message }: { label: string; message: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.sectionLabel}>{label}</div>
      <p className={styles.error}>{message}</p>
    </main>
  )
}

export function SliceThreeNote({ present }: { present: boolean }) {
  return (
    <p className={styles.legend}>
      {present
        ? <>Estados del Slice 3 (bob.bob_cell_rollup): <span className={styles.noRow}>No aplica</span> vacío ·{' '}
          <span className={styles.notConfigured}>No configurado</span>: falta una declaración ·{' '}
          <span className={styles.noRow}>Pendiente</span>: el bucket aún no sella · <b>—</b>: no observado ·
          una cifra (también 0): observado · <sup>*</sup> provisional. Pasa el cursor para ver el motivo.</>
        : 'Estados del Slice 3 pendientes (bob.bob_cell_rollup no existe en esta base): se pinta lo que se leyó, sin inventar estados.'}
    </p>
  )
}

// A cell whose state is not observed: painted by state, never as a figure
// (Slice 3 §2). The title carries every reason and the coverage.
export function StatePaint({ info }: { info: StateInfo }) {
  const title = stateTitle(info)
  switch (info.state) {
    case 'not_applicable':
      return <span className={styles.noRow} title={title} aria-label={STATE_LABEL.not_applicable} />
    case 'not_configured':
      return <span className={styles.notConfigured} title={title}>{reasonSummary(info.reasons) || STATE_LABEL.not_configured}</span>
    case 'pending':
      return <span className={styles.noRow} title={title}>{STATE_LABEL.pending}</span>
    default:
      return <span className={styles.noRow} title={title} aria-label={STATE_LABEL[info.state]}>—</span>
  }
}

export function NoProjection({ np }: { np: NotProjection }) {
  return <span className={styles.noRow} title={np.note}>sin proyección</span>
}

// One cell: a value, a written zero, or no row. Never a 0 for no row.
export function CellText({ cell, format = (v) => String(v), pct = false }: {
  cell: Cell; format?: (v: number) => string; pct?: boolean
}) {
  const st = cell.state
  if (st && st.state !== 'observed') return <StatePaint info={st} />
  // Observed with no row: a declared-absent actor, a zero by declaration (F-32).
  // Not formatted: for durations the rollup's value is the sample count, not a time.
  if (st && cell.kind === 'no_row') return <span className={styles.zero} title={stateTitle(st)}>{st.value ?? 0}</span>
  if (cell.kind === 'no_row') return <span className={styles.noRow} title="sin fila de proyección">sin fila</span>
  const open = cell.open > 0 ? <sup title={`${cell.open} de ${cell.rows} filas sin sellar`}>*</sup> : null
  if (cell.kind === 'zero') return <span className={styles.zero} title={`${cell.rows} filas, en cero`}>0{open}</span>
  return (
    <span title={`${cell.rows} filas`}>
      {format(cell.value)}{open}
      {pct && cell.pct !== null ? <span className={styles.share}> {Math.round(cell.pct * 100)}%</span> : null}
    </span>
  )
}

export function Declared({ what, by }: { what: string; by: string[] }) {
  return by.length
    ? <span className={styles.source}>{what}: {by.join(', ')}</span>
    : <span className={styles.source + ' ' + styles.notConfigured}>{what}: no configurado en la selección</span>
}

export function ChannelPicker({ channels, current, qs }: {
  channels: Channel[]; current?: string; qs: (channel?: string) => string
}) {
  return (
    <nav className={styles.channels}>
      <Link href={qs()} className={!current ? styles.on : undefined}>Todos</Link>
      {channels.map((c) => (
        <Link key={c.id} href={qs(c.id)} className={current === c.id ? styles.on : undefined}>{c.name}</Link>
      ))}
    </nav>
  )
}

export function windowQs(from: Date, to: Date) {
  return (channel?: string) => {
    const p = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
    if (channel) p.set('channel', channel)
    return `?${p}`
  }
}
