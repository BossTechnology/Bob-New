// INTERACCIONES of the demo over BOb's projections: Sesiones, Canales and
// Tiempo Prom., read as bob_app under the box's org. A figure with no row is
// "sin fila", never 0; a figure no projection carries is "sin proyección".
import { notFound } from 'next/navigation'
import { requireScreen } from '@/lib/bob/screen-gate.ts'
import { buildInteractions } from '@/lib/bob/screens.ts'
import {
  BobConfigError, UnknownChannelError, boxOrgId, readInteractions, type InteractionsRead,
} from '@/lib/bob/projection-reader.ts'
import {
  CellText, ChannelPicker, LegendView, NoProjection, NoteLine, ReadError, ScreenHeader, ScreenNav, Unavailable, Forbidden, windowQs,
} from '../screen-parts'
import {
  audienceFor, declared, interactionsLegend, readError, sliceThreeNote, techNote,
} from '@/lib/bob/screen-copy.ts'
import styles from '../performance/matrix.module.css'

export const dynamic = 'force-dynamic'

type Search = Promise<{ from?: string; to?: string; channel?: string }>
const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`

export default async function InteractionsPage({ searchParams }: { searchParams: Search }) {
  const gate = await requireScreen()
  if (gate === 'unavailable') return <Unavailable />
  if (gate === 'forbidden') return <Forbidden />
  const a = audienceFor(gate.role)
  const q = await searchParams
  let read: InteractionsRead
  try {
    read = await readInteractions(boxOrgId(), q)
  } catch (e) {
    if (e instanceof UnknownChannelError) notFound()
    if (!(e instanceof BobConfigError)) console.error('bob/interactions: read failed', e)
    const err = readError('interactions', a, e instanceof BobConfigError ? e.message : null)
    return <ReadError label={err.label} message={err.message} />
  }
  const s = buildInteractions(read.durations, read.selected, read.cells)
  const { from, to } = read.window
  const tech = a === 'technical'

  return (
    <main className={styles.page}>
      <ScreenNav current="interactions" />
      <ScreenHeader screen="interactions" a={a} from={from} to={to} watermark={read.watermark} />
      <ChannelPicker channels={read.channels} current={q.channel} qs={windowQs(from, to)} />

      <div className={styles.rendGrid}>
        <div className={styles.mRow}>
          <div className={styles.mName}>Sesiones<NoteLine note={techNote(s.sessions.note, a)} /></div>
          <div className={styles.mTotal}><NoProjection np={s.sessions} a={a} /></div>
        </div>
        <div className={styles.mRow}>
          <div className={styles.mName}>
            Tiempo Prom.
            <NoteLine note={techNote('proj_durations · interaction_duration (sum_ms / n)', a)} />
            <NoteLine note={declared('capacidad resolution', s.durationDeclaredBy, a, read.selected.length)} />
          </div>
          <div className={styles.mTotal}><CellText cell={s.avgDuration} a={a} format={minutes} /></div>
        </div>
        <div className={styles.mRow}>
          <div className={styles.mName}>Conversaciones cerradas<NoteLine note={techNote('n de interaction_duration', a)} /></div>
          <div className={styles.mTotal}><CellText cell={s.closed} a={a} /></div>
        </div>
      </div>

      <div className={styles.sectionLabel}>Canales</div>
      <table className={styles.table}>
        <thead><tr><th>Canal</th><th>Tipo</th><th>Tiempo Prom.</th><th>Cerradas</th>{tech ? <th>lag_seconds</th> : null}</tr></thead>
        <tbody>
          {s.byChannel.map(({ channel: c, avgDuration, closed }) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.type}</td>
              <td><CellText cell={avgDuration} a={a} format={minutes} /></td>
              <td><CellText cell={closed} a={a} /></td>
              {tech
                ? <td>{c.lag_seconds === null ? <span className={styles.notConfigured}>lag no declarado</span> : c.lag_seconds}</td>
                : null}
            </tr>
          ))}
        </tbody>
      </table>
      <LegendView items={interactionsLegend(a, read.cells !== null)} />
      <LegendView items={sliceThreeNote(a, read.cells !== null)} />
    </main>
  )
}
