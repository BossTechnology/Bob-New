// Pieces the three /bob screens share. Painting only: no rule lives here.
import Link from 'next/link'
import type { Cell, Channel } from '@/lib/bob/matrix.ts'
import type { NotProjection } from '@/lib/bob/screens.ts'
import {
  paintCell, paintNoProjection, screenTitle, technicalMeta,
  type Audience, type LegendItem, type Note, type Paint, type Screen, type Tone,
} from '@/lib/bob/screen-copy.ts'
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

export function ReadError({ label, message }: { label: string; message: string }) {
  return (
    <main className={styles.page}>
      <div className={styles.sectionLabel}>{label}</div>
      <p className={styles.error}>{message}</p>
    </main>
  )
}

const TONE: Record<Tone, string | undefined> = {
  value: undefined, zero: styles.zero, noRow: styles.noRow, notConfigured: styles.notConfigured, empty: styles.noRow,
}

// One painted cell (screen-copy.ts decides the words for the audience).
export function PaintView({ p }: { p: Paint }) {
  return (
    <span className={TONE[p.tone]} title={p.title} aria-label={p.label}>
      {p.text}{p.open ? <sup title={p.open}>*</sup> : null}
      {p.share ? <span className={styles.share}>{p.share}</span> : null}
    </span>
  )
}

// One cell: a value, a written zero, or no row. Never a 0 for no row.
export function CellText({ cell, a, format, unit, pct = false }: {
  cell: Cell; a: Audience; format?: (v: number) => string; unit?: string; pct?: boolean
}) {
  return <PaintView p={paintCell(cell, a, { format, unit, pct })} />
}

export function NoProjection({ np, a }: { np: NotProjection; a: Audience }) {
  return <PaintView p={paintNoProjection(np, a)} />
}

// The line under a metric's name, or nothing.
export function NoteLine({ note }: { note: Note | null }) {
  if (!note) return null
  return <span className={styles.source + (note.tone === 'notConfigured' ? ' ' + styles.notConfigured : '')}>{note.text}</span>
}

export function LegendView({ items }: { items: LegendItem[] | null }) {
  if (!items) return null
  return (
    <p className={styles.legend}>
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 ? ' · ' : null}
          {it.sample
            ? <>{it.sample.tone === 'sup' ? <sup>{it.sample.text}</sup> : <span className={TONE[it.sample.tone]}>{it.sample.text}</span>}: </>
            : null}
          {it.text}
        </span>
      ))}
    </p>
  )
}

// The title and the window. The viewer reads the window in the browser's own
// time zone; the technical audience reads ISO instants, as before.
export function ScreenHeader({ screen, a, from, to, orgId, watermark }: {
  screen: Screen; a: Audience; from: Date; to: Date; orgId?: string; watermark?: Date | null | false
}) {
  return (
    <>
      <div className={styles.sectionLabel}>{screenTitle(screen, a)}</div>
      <p className={styles.meta}>
        {a === 'viewer'
          ? <LocalWindow from={from.toISOString()} to={to.toISOString()} />
          : technicalMeta({ from, to }, { orgId, watermark }).map((m, i) => (
            <span key={m.label}>{i > 0 ? ' · ' : null}{m.label} <code>{m.value}</code></span>
          ))}
      </p>
    </>
  )
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
