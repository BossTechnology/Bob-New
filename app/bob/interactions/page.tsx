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
  CellText, ChannelPicker, Declared, NoProjection, ReadError, ScreenNav, SliceThreeNote, Unavailable, windowQs,
} from '../screen-parts'
import styles from '../performance/matrix.module.css'

export const dynamic = 'force-dynamic'

type Search = Promise<{ from?: string; to?: string; channel?: string }>
const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`

export default async function InteractionsPage({ searchParams }: { searchParams: Search }) {
  if ((await requireScreen()) === 'unavailable') return <Unavailable />
  const q = await searchParams
  let read: InteractionsRead
  try {
    read = await readInteractions(boxOrgId(), q)
  } catch (e) {
    if (e instanceof UnknownChannelError) notFound()
    if (!(e instanceof BobConfigError)) console.error('bob/interactions: read failed', e)
    return <ReadError label="INTERACCIONES · proyecciones"
      message={e instanceof BobConfigError ? e.message : 'No se pudieron leer las proyecciones.'} />
  }
  const s = buildInteractions(read.durations, read.selected)
  const { from, to } = read.window

  return (
    <main className={styles.page}>
      <ScreenNav current="interactions" />
      <div className={styles.sectionLabel}>INTERACCIONES · proyecciones reales (bob_app)</div>
      <p className={styles.meta}>
        ventana <code>{from.toISOString()}</code> → <code>{to.toISOString()}</code> · watermark{' '}
        <code>{read.watermark ? new Date(read.watermark).toISOString() : 'sin filas'}</code>
      </p>
      <ChannelPicker channels={read.channels} current={q.channel} qs={windowQs(from, to)} />

      <div className={styles.rendGrid}>
        <div className={styles.mRow}>
          <div className={styles.mName}>Sesiones<span className={styles.source}>{s.sessions.note}</span></div>
          <div className={styles.mTotal}><NoProjection np={s.sessions} /></div>
        </div>
        <div className={styles.mRow}>
          <div className={styles.mName}>
            Tiempo Prom.
            <span className={styles.source}>proj_durations · interaction_duration (sum_ms / n)</span>
            <Declared what="capacidad resolution" by={s.durationDeclaredBy} />
          </div>
          <div className={styles.mTotal}><CellText cell={s.avgDuration} format={minutes} /></div>
        </div>
        <div className={styles.mRow}>
          <div className={styles.mName}>Conversaciones cerradas<span className={styles.source}>n de interaction_duration</span></div>
          <div className={styles.mTotal}><CellText cell={s.closed} /></div>
        </div>
      </div>

      <div className={styles.sectionLabel}>Canales</div>
      <table className={styles.table}>
        <thead><tr><th>Canal</th><th>Tipo</th><th>Tiempo Prom.</th><th>Cerradas</th><th>lag_seconds</th></tr></thead>
        <tbody>
          {s.byChannel.map(({ channel: c, avgDuration, closed }) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.type}</td>
              <td><CellText cell={avgDuration} format={minutes} /></td>
              <td><CellText cell={closed} /></td>
              <td>{c.lag_seconds === null ? <span className={styles.notConfigured}>lag no declarado</span> : c.lag_seconds}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <SliceThreeNote present={read.cellStateView} />
    </main>
  )
}
