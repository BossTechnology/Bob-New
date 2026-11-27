// Thin rendering of the Performance matrix over BOb's projections (BOB-7,
// "When there is something to look at"). The demo's RENDIMIENTO layout with
// real projection rows, unpolished. Each cell shows what was read: a value, a
// written zero, or no row at all. Nothing absent is turned into 0.
//
// In the box (BOB_CAJA=1) it is one of the three screens, behind the box's
// GoTrue session. Outside the box it is off unless BOB_PERF_MATRIX=1, never in
// Vercel production, and only with Supabase auth configured (screen-gate.ts).
import { notFound } from 'next/navigation'
import { requireScreen } from '@/lib/bob/screen-gate.ts'
import {
  CellText, ChannelPicker, LegendView, NoteLine, PaintView, ReadError, ScreenHeader, ScreenNav, Unavailable, Forbidden, windowQs,
} from '../screen-parts'
import {
  audienceFor, labelFailuresTitle, paintNoTable, performanceLegend, readError, rowSource, showsTechnicalTables,
  sliceThreeNote, type Audience,
} from '@/lib/bob/screen-copy.ts'
import {
  ACTOR_LABEL, buildMatrix,
  type ActorType, type Channel, type MatrixRow,
} from '@/lib/bob/matrix.ts'
import {
  BobConfigError, PROJECTIONS, UnknownChannelError, boxOrgId, readPerformance,
  type PerformanceRead,
} from '@/lib/bob/projection-reader.ts'
import styles from './matrix.module.css'

export const dynamic = 'force-dynamic'

type Search = Promise<{ from?: string; to?: string; channel?: string }>

export default async function PerformanceMatrixPage({ searchParams }: { searchParams: Search }) {
  const gate = await requireScreen()
  if (gate === 'unavailable') return <Unavailable />
  if (gate === 'forbidden') return <Forbidden />
  const a = audienceFor(gate.role)
  const q = await searchParams

  let read: PerformanceRead
  try {
    read = await readPerformance(boxOrgId(), q)
  } catch (e) {
    if (e instanceof UnknownChannelError) notFound()
    // Our own configuration messages are safe to show; a database error is
    // logged on the server and never rendered.
    if (!(e instanceof BobConfigError)) console.error('bob/performance: read failed', e)
    const err = readError('performance', a, e instanceof BobConfigError ? e.message : null)
    return <ReadError label={err.label} message={err.message} />
  }

  const matrix = buildMatrix(read.counts, read.responseTimes, read.selected, read.cells)
  const { from, to } = read.window
  const n = read.selected.length

  return (
    <main className={styles.page}>
      <ScreenNav current="performance" />
      <ScreenHeader screen="performance" a={a} from={from} to={to} orgId={read.orgId} watermark={read.watermark} />
      <ChannelPicker channels={read.channels} current={q.channel} qs={windowQs(from, to)} />

      <div className={styles.rendGrid}>
        <Head actors={matrix.actors} title="Stats" />
        {matrix.rows.map((r) => <Row key={r.spec.id} row={r} actors={matrix.actors} a={a} n={n} />)}
      </div>

      <div className={styles.sectionLabel}>{labelFailuresTitle(a)}</div>
      <div className={styles.rendGrid}>
        <Head actors={matrix.actors} title="Fallas" />
        {matrix.labelFailures.map((r) => <Row key={r.spec.id} row={r} actors={matrix.actors} a={a} n={n} />)}
      </div>

      <LegendView items={performanceLegend(a, read.cells !== null)} />
      <LegendView items={sliceThreeNote(a, read.cells !== null)} />

      {showsTechnicalTables(a) ? <>
        <div className={styles.sectionLabel}>Canales seleccionados</div>
        <ChannelTable channels={read.selected} />

        <div className={styles.sectionLabel}>Las ocho proyecciones · filas en la ventana</div>
        <PresenceTable read={read} />
      </> : null}
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

function Row({ row, actors, a, n }: { row: MatrixRow; actors: ActorType[]; a: Audience; n: number }) {
  const isTime = row.spec.table === 'proj_durations'
  const name = <div className={styles.mName}>{row.spec.label}<NoteLine note={rowSource(row, a, n)} /></div>
  if (row.spec.table === null && !row.total.state) {
    // A demo row no projection carries: there is no row to be absent.
    const none = <PaintView p={paintNoTable(a)} />
    return (
      <div className={styles.mRow}>
        {name}
        <div className={styles.mTotal}>{none}</div>
        {actors.map((x) => <div key={x} className={styles.mPct}>{none}</div>)}
      </div>
    )
  }
  return (
    <div className={styles.mRow}>
      {name}
      <div className={styles.mTotal}><CellText cell={row.total} a={a} unit={isTime ? ' resp.' : ''} /></div>
      {actors.map((x) => (
        <div key={x} className={styles.mPct + (x === 'asa' ? ' ' + styles.ai : '')}>
          <CellText cell={row.cells[x]} a={a} format={isTime ? seconds : undefined} pct={!isTime} />
        </div>
      ))}
    </div>
  )
}

const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`

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
