// Pieces the three /bob screens share. Painting only: no rule lives here.
import type { ReactNode } from 'react'
import Link from 'next/link'
import type { Cell, Channel } from '@/lib/bob/matrix.ts'
import type { NotProjection } from '@/lib/bob/screens.ts'
import { STATE_LABEL, reasonSummary, stateTitle, type StateInfo } from '@/lib/bob/cell-state.ts'
import { CLIENT_TEXT, noDataFor, type Audience } from '@/lib/bob/audience.ts'
import styles from './performance/matrix.module.css'
import { SignOut } from './sign-out'
import { LocalWindow } from './local-window'

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

// A viewer gets the screen's name and a plain sentence: a configuration
// message names variables, and is for the technical view only.
export function ReadError({ label, message, audience = 'technical' }: {
  label: string; message: string; audience?: Audience
}) {
  const client = audience === 'client'
  return (
    <main className={styles.page}>
      <div className={styles.sectionLabel}>{client ? label.split(' · ')[0] : label}</div>
      <p className={styles.error}>{client ? CLIENT_TEXT.readError : message}</p>
    </main>
  )
}

// The screen's title and window. The technical view keeps the org, the ISO
// window and the watermark; a viewer reads a title and the dates.
export function ScreenHeader({ title, audience, from, to, orgId, watermark }: {
  title: string; audience: Audience; from: Date; to: Date; orgId?: string; watermark?: Date | null
}) {
  if (audience === 'client') {
    return (
      <>
        <div className={styles.sectionLabel}>{title}</div>
        <p className={styles.meta}><LocalWindow from={from.toISOString()} to={to.toISOString()} /></p>
      </>
    )
  }
  return (
    <>
      <div className={styles.sectionLabel}>{title} · proyecciones reales (bob_app)</div>
      <p className={styles.meta}>
        {orgId ? <>org <code>{orgId}</code> · </> : null}
        ventana <code>{from.toISOString()}</code> → <code>{to.toISOString()}</code>
        {watermark !== undefined
          ? <> · watermark <code>{watermark ? new Date(watermark).toISOString() : 'sin filas'}</code></>
          : null}
      </p>
    </>
  )
}

// A short line under a figure saying where it comes from: technical view only.
export function SourceNote({ audience, children }: { audience: Audience; children: ReactNode }) {
  return audience === 'client' ? null : <span className={styles.source}>{children}</span>
}

export function SliceThreeNote({ present, audience = 'technical' }: { present: boolean; audience?: Audience }) {
  if (audience === 'client') {
    return present
      ? <p className={styles.legend}>
          <span className={styles.noRow}>No aplica</span>: la cifra no corresponde a estos canales ·{' '}
          <span className={styles.notConfigured}>No configurado</span>: el canal aún no envía este dato ·{' '}
          <span className={styles.noRow}>Pendiente</span>: el periodo aún no se cierra · <b>—</b>: sin datos todavía ·{' '}
          <sup>*</sup> cifra provisional.
        </p>
      : null
  }
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
// A viewer sees the state's name, never its reasons (they name channel fields).
export function StatePaint({ info, audience = 'technical' }: { info: StateInfo; audience?: Audience }) {
  const client = audience === 'client'
  const title = client
    ? [STATE_LABEL[info.state], ...(info.provisional ? [CLIENT_TEXT.provisional] : [])].join('\n')
    : stateTitle(info)
  switch (info.state) {
    case 'not_applicable':
      return <span className={styles.noRow} title={title} aria-label={STATE_LABEL.not_applicable} />
    case 'not_configured':
      return <span className={styles.notConfigured} title={title}>
        {(!client && reasonSummary(info.reasons)) || STATE_LABEL.not_configured}
      </span>
    case 'pending':
      return <span className={styles.noRow} title={title}>{STATE_LABEL.pending}</span>
    default:
      return <span className={styles.noRow} title={title} aria-label={STATE_LABEL[info.state]}>—</span>
  }
}

export function NoProjection({ np, audience = 'technical' }: { np: NotProjection; audience?: Audience }) {
  return audience === 'client'
    ? <span className={styles.noRow}>{CLIENT_TEXT.noFigure}</span>
    : <span className={styles.noRow} title={np.note}>sin proyección</span>
}

// What a cell's tooltip says. A viewer is not told about rows or buckets.
export function cellTitles(audience: Audience) {
  return audience === 'client'
    ? {
        noRow: undefined, rows: () => undefined, zero: () => undefined,
        open: () => CLIENT_TEXT.provisional, noRowText: CLIENT_TEXT.noData,
      }
    : {
        noRow: 'sin fila de proyección', noRowText: 'sin fila',
        rows: (rows: number) => `${rows} filas`,
        zero: (rows: number) => `${rows} filas, en cero`,
        open: (open: number, rows: number) => `${open} de ${rows} filas sin sellar`,
      }
}

// One cell: a value, a written zero, or no row. Never a 0 for no row.
export function CellText({ cell, format = (v) => String(v), pct = false, audience = 'technical' }: {
  cell: Cell; format?: (v: number) => string; pct?: boolean; audience?: Audience
}) {
  const t = cellTitles(audience)
  const st = cell.state
  if (st && st.state !== 'observed') return <StatePaint info={st} audience={audience} />
  // Observed with no row: a declared-absent actor, a zero by declaration (F-32).
  // Not formatted: for durations the rollup's value is the sample count, not a time.
  if (st && cell.kind === 'no_row') {
    return <span className={styles.zero} title={audience === 'client' ? undefined : stateTitle(st)}>{st.value ?? 0}</span>
  }
  if (cell.kind === 'no_row') return <span className={styles.noRow} title={t.noRow}>{t.noRowText}</span>
  const open = cell.open > 0 ? <sup title={t.open(cell.open, cell.rows)}>*</sup> : null
  if (cell.kind === 'zero') return <span className={styles.zero} title={t.zero(cell.rows)}>0{open}</span>
  return (
    <span title={t.rows(cell.rows)}>
      {format(cell.value)}{open}
      {pct && cell.pct !== null ? <span className={styles.share}> {Math.round(cell.pct * 100)}%</span> : null}
    </span>
  )
}

// Which channels declare what a figure needs. A viewer sees nothing when some
// do, and a short "no data" line when none does, never the capability's name.
export function Declared({ what, by, audience = 'technical', selected = 0 }: {
  what: string; by: string[]; audience?: Audience; selected?: number
}) {
  if (audience === 'client') {
    return by.length ? null : <span className={styles.source + ' ' + styles.notConfigured}>{noDataFor(selected)}</span>
  }
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
