// What /bob/interactions paints, for a viewer (the client's words) or for
// admin and analyst (projection, measure and capability under each figure).
// Painting only: the figures come from buildInteractions, the same for both.
import { buildInteractions } from '@/lib/bob/screens.ts'
import type { InteractionsRead } from '@/lib/bob/projection-reader.ts'
import type { Audience } from '@/lib/bob/audience.ts'
import {
  CellText, ChannelPicker, Declared, NoProjection, ScreenHeader, ScreenNav, SliceThreeNote, SourceNote, windowQs,
} from '../screen-parts'
import styles from '../performance/matrix.module.css'

const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`

export function InteractionsView({ read, channel, audience }: {
  read: InteractionsRead; channel?: string; audience: Audience
}) {
  const s = buildInteractions(read.durations, read.selected, read.cells)
  const { from, to } = read.window
  const client = audience === 'client'

  return (
    <main className={styles.page}>
      <ScreenNav current="interactions" />
      <ScreenHeader title="INTERACCIONES" audience={audience} from={from} to={to} watermark={read.watermark} />
      <ChannelPicker channels={read.channels} current={channel} qs={windowQs(from, to)} />

      <div className={styles.rendGrid}>
        <div className={styles.mRow}>
          <div className={styles.mName}>Sesiones<SourceNote audience={audience}>{s.sessions.note}</SourceNote></div>
          <div className={styles.mTotal}><NoProjection np={s.sessions} audience={audience} /></div>
        </div>
        <div className={styles.mRow}>
          <div className={styles.mName}>
            Tiempo Prom.
            <SourceNote audience={audience}>proj_durations · interaction_duration (sum_ms / n)</SourceNote>
            <Declared what="capacidad resolution" by={s.durationDeclaredBy} audience={audience} selected={read.selected.length} />
          </div>
          <div className={styles.mTotal}><CellText cell={s.avgDuration} format={minutes} audience={audience} /></div>
        </div>
        <div className={styles.mRow}>
          <div className={styles.mName}>Conversaciones cerradas<SourceNote audience={audience}>n de interaction_duration</SourceNote></div>
          <div className={styles.mTotal}><CellText cell={s.closed} audience={audience} /></div>
        </div>
      </div>

      <div className={styles.sectionLabel}>Canales</div>
      <table className={styles.table}>
        <thead><tr><th>Canal</th><th>Tipo</th><th>Tiempo Prom.</th><th>Cerradas</th>{client ? null : <th>lag_seconds</th>}</tr></thead>
        <tbody>
          {s.byChannel.map(({ channel: c, avgDuration, closed }) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.type}</td>
              <td><CellText cell={avgDuration} format={minutes} audience={audience} /></td>
              <td><CellText cell={closed} audience={audience} /></td>
              {client ? null
                : <td>{c.lag_seconds === null ? <span className={styles.notConfigured}>lag no declarado</span> : c.lag_seconds}</td>}
            </tr>
          ))}
        </tbody>
      </table>
      <SliceThreeNote present={read.cells !== null} audience={audience} />
    </main>
  )
}
