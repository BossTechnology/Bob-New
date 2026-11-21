// Thin rendering of the Performance matrix over BOb's projections (BOB-7,
// "When there is something to look at"). The demo's RENDIMIENTO layout with
// real projection rows, unpolished. Each cell shows what was read: a value, a
// written zero, or no row at all. Nothing absent is turned into 0.
//
// In the box (BOB_CAJA=1) it is one of the three screens, behind the box's
// GoTrue session. Outside the box it is off unless BOB_PERF_MATRIX=1, never in
// Vercel production, and only with Supabase auth configured (screen-gate.ts).
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { requireScreen } from '@/lib/bob/screen-gate.ts'
import { ScreenNav, Unavailable, SliceThreeNote } from '../screen-parts'
import {
  ACTOR_LABEL, buildMatrix,
  type ActorType, type Cell, type Channel, type MatrixRow,
} from '@/lib/bob/matrix.ts'
import {
  BobConfigError, PROJECTIONS, UnknownChannelError, boxOrgId, readPerformance,
  type PerformanceRead,
} from '@/lib/bob/projection-reader.ts'
import styles from './matrix.module.css'

export const dynamic = 'force-dynamic'

type Search = Promise<{ from?: string; to?: string; channel?: string }>

export default async function PerformanceMatrixPage({ searchParams }: { searchParams: Search }) {
  if ((await requireScreen()) === 'unavailable') return <Unavailable />
  const q = await searchParams

  let read: PerformanceRead
  try {
    read = await readPerformance(boxOrgId(), q)
  } catch (e) {
    if (e instanceof UnknownChannelError) notFound()
    // Our own configuration messages are safe to show; a database error is
    // logged on the server and never rendered.
    if (!(e instanceof BobConfigError)) console.error('bob/performance: read failed', e)
    const msg = e instanceof BobConfigError ? e.message : 'No se pudieron leer las proyecciones.'
    return (
      <main className={styles.page}>
        <div className={styles.sectionLabel}>RENDIMIENTO · proyecciones</div>
        <p className={styles.error}>{msg}</p>
      </main>
    )
  }

  const matrix = buildMatrix(read.counts, read.responseTimes, read.selected)
  const { from, to } = read.window
  const qs = (channel?: string) => {
    const p = new URLSearchParams({ from: from.toISOString(), to: to.toISOString() })
    if (channel) p.set('channel', channel)
    return `?${p}`
  }

  return (
    <main className={styles.page}>
      <ScreenNav current="performance" />
      <div className={styles.sectionLabel}>RENDIMIENTO · proyecciones reales (bob_app)</div>
      <p className={styles.meta}>
        org <code>{read.orgId}</code> · ventana <code>{from.toISOString()}</code> →{' '}
        <code>{to.toISOString()}</code> · watermark{' '}
        <code>{read.watermark ? new Date(read.watermark).toISOString() : 'sin filas'}</code>
      </p>
      <nav className={styles.channels}>
        <Link href={qs()} className={!q.channel ? styles.on : undefined}>Todos</Link>
        {read.channels.map((c) => (
          <Link key={c.id} href={qs(c.id)} className={q.channel === c.id ? styles.on : undefined}>
            {c.name}
          </Link>
        ))}
      </nav>

      <div className={styles.rendGrid}>
        <Head actors={matrix.actors} title="Stats" />
        {matrix.rows.map((r) => <Row key={r.spec.id} row={r} actors={matrix.actors} />)}
      </div>

      <div className={styles.sectionLabel}>Turnos sin etiqueta · proj_metric_counts</div>
      <div className={styles.rendGrid}>
        <Head actors={matrix.actors} title="Fallas" />
        {matrix.labelFailures.map((r) => <Row key={r.spec.id} row={r} actors={matrix.actors} />)}
      </div>

      <Legend />
      <SliceThreeNote present={read.cellStateView} />

      <div className={styles.sectionLabel}>Canales seleccionados</div>
      <ChannelTable channels={read.selected} />

      <div className={styles.sectionLabel}>Las ocho proyecciones · filas en la ventana</div>
      <PresenceTable read={read} />
    </main>
  )
}

function Head({ actors, title }: { actors: ActorType[]; title: string }) {
  return (
    <div className={styles.mRow + ' ' + styles.head}>
      <div className={styles.metricHeader}>{title}</div>
      <div className={styles.mTotal}>Total</div>
      {actors.map((a) => <div key={a} className={styles.actorHead}>{ACTOR_LABEL[a]}</div>)}
    </div>
  )
}

function Row({ row, actors }: { row: MatrixRow; actors: ActorType[] }) {
  const isTime = row.spec.table === 'proj_durations'
  if (row.spec.table === null) {
    // A demo row no projection carries: there is no row to be absent.
    const none = <span className={styles.noRow} title="ninguna de las ocho tablas lo lleva">sin proyección</span>
    return (
      <div className={styles.mRow}>
        <div className={styles.mName}>{row.spec.label}<Source row={row} /></div>
        <div className={styles.mTotal}>{none}</div>
        {actors.map((a) => <div key={a} className={styles.mPct}>{none}</div>)}
      </div>
    )
  }
  return (
    <div className={styles.mRow}>
      <div className={styles.mName}>
        {row.spec.label}
        <Source row={row} />
      </div>
      <div className={styles.mTotal}><CellView cell={row.total} unit={isTime ? ' resp.' : ''} /></div>
      {actors.map((a) => (
        <div key={a} className={styles.mPct + (a === 'asa' ? ' ' + styles.ai : '')}>
          <CellView cell={row.cells[a]} time={isTime} pct={!isTime} />
        </div>
      ))}
    </div>
  )
}

function Source({ row }: { row: MatrixRow }) {
  const s = row.spec.source
  let text: string
  let notConfigured = false
  if (s.kind === 'not_projection') text = s.note
  else if (s.kind === 'unnamed') text = `${row.spec.table}.${row.spec.metric} · el contrato no nombra capacidad`
  else {
    const what = s.kind === 'capability' ? `capacidad ${s.capability}` : 'idle_bound_seconds'
    const by = row.declaredBy ?? []
    notConfigured = by.length === 0
    text = notConfigured ? `${what}: no configurado en la selección` : `${what}: ${by.join(', ')}`
  }
  return (
    <span className={styles.source + (notConfigured ? ' ' + styles.notConfigured : '')}>
      {text}{row.spec.note ? ` · ${row.spec.note}` : ''}
    </span>
  )
}

function CellView({ cell, time = false, pct = false, unit = '' }: {
  cell: Cell; time?: boolean; pct?: boolean; unit?: string
}) {
  if (cell.kind === 'no_row') return <span className={styles.noRow} title="sin fila de proyección">sin fila</span>
  const open = cell.open > 0 ? <sup title={`${cell.open} de ${cell.rows} filas sin sellar`}>*</sup> : null
  if (cell.kind === 'zero') {
    return <span className={styles.zero} title={`${cell.rows} filas, todas en cero`}>0{unit}{open}</span>
  }
  const v = time ? `${(cell.value / 1000).toFixed(1)} s` : `${cell.value}${unit}`
  return (
    <span title={`${cell.rows} filas`}>
      {v}{open}
      {pct && cell.pct !== null ? <span className={styles.share}> {Math.round(cell.pct * 100)}%</span> : null}
    </span>
  )
}

function Legend() {
  return (
    <p className={styles.legend}>
      <span className={styles.noRow}>sin fila</span>: ninguna fila de proyección en la ventana ·{' '}
      <span className={styles.noRow}>sin proyección</span>: la fila de la demo no tiene tabla detrás ·{' '}
      <span className={styles.zero}>0</span>: hay filas y suman cero ·{' '}
      <span className={styles.notConfigured}>no configurado</span>: ningún canal de la selección declara lo que
      la fila necesita · <sup>*</sup> incluye buckets sin sellar · % = parte del total de la fila
    </p>
  )
}

function ChannelTable({ channels }: { channels: Channel[] }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr><th>Canal</th><th>Tipo</th><th>lag_seconds</th><th>idle_bound_seconds</th><th>Capacidades</th></tr>
      </thead>
      <tbody>
        {channels.map((c) => (
          <tr key={c.id}>
            <td>{c.name}</td>
            <td>{c.type}</td>
            <td>{c.lag_seconds === null ? <span className={styles.notConfigured}>lag no declarado</span> : c.lag_seconds}</td>
            <td>{c.idle_bound_seconds === null ? <span className={styles.notConfigured}>sin declarar</span> : c.idle_bound_seconds}</td>
            <td>{c.capabilities.length ? c.capabilities.join(', ') : <span className={styles.notConfigured}>ninguna</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}

function PresenceTable({ read }: { read: PerformanceRead }) {
  const cols: (Channel | null)[] = [...read.selected]
  if (read.presence.some((p) => p.channel_id === null)) cols.push(null)
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th>Proyección</th>
          {cols.map((c) => <th key={c?.id ?? 'null'}>{c ? c.name : 'sin canal'}</th>)}
        </tr>
      </thead>
      <tbody>
        {PROJECTIONS.map((t) => (
          <tr key={t}>
            <td><code>{t}</code></td>
            {cols.map((c) => {
              const p = read.presence.find((x) => x.table === t && x.channel_id === (c?.id ?? null))
              return (
                <td key={c?.id ?? 'null'}>
                  {p ? <>{p.rows}{p.open ? <sup title={`${p.open} sin sellar`}>*</sup> : null}</>
                    : <span className={styles.noRow}>sin fila</span>}
                </td>
              )
            })}
          </tr>
        ))}
      </tbody>
    </table>
  )
}
