// What /bob/quality paints, for a viewer (the client's words) or for admin
// and analyst (projection and capability under each figure).
// Painting only: the figures come from buildQuality, the same for both.
import { ACTOR_LABEL } from '@/lib/bob/matrix.ts'
import { buildQuality, SENTIMENT_STATES, type SentimentPanel } from '@/lib/bob/screens.ts'
import type { QualityRead } from '@/lib/bob/projection-reader.ts'
import { CLIENT_TEXT, type Audience } from '@/lib/bob/audience.ts'
import {
  CellText, ChannelPicker, Declared, NoProjection, ScreenHeader, ScreenNav, SliceThreeNote, SourceNote, windowQs,
} from '../screen-parts'
import styles from '../performance/matrix.module.css'

export function QualityView({ read, channel, audience }: {
  read: QualityRead; channel?: string; audience: Audience
}) {
  const s = buildQuality(read.sentiment, read.counts, read.selected, read.cells)
  const { from, to } = read.window
  const client = audience === 'client'

  return (
    <main className={styles.page}>
      <ScreenNav current="quality" />
      <ScreenHeader title="CALIDAD Y EXPERIENCIA" audience={audience} from={from} to={to} />
      <ChannelPicker channels={read.channels} current={channel} qs={windowQs(from, to)} />

      <div className={styles.rendGrid}>
        <div className={styles.mRow}>
          <div className={styles.mName}>NPS<SourceNote audience={audience}>{s.nps.note}</SourceNote></div>
          <div className={styles.mTotal}><NoProjection np={s.nps} audience={audience} /></div>
        </div>
      </div>

      <div className={styles.sectionLabel}>
        {client ? 'Ánimo & Sentimiento' : 'Ánimo & Sentimiento · proj_sentiment (lecturas por estado)'}
      </div>
      <SentimentTable panels={[s.orga, s.meca]} audience={audience} selected={read.selected.length} />

      <div className={styles.sectionLabel}>{client ? CLIENT_TEXT.unlabeledTurns : 'Turnos sin etiqueta · proj_metric_counts'}</div>
      <table className={styles.table}>
        <thead><tr><th>Falla</th><th>{ACTOR_LABEL.user}</th></tr></thead>
        <tbody>
          {s.labelFailures.map((r) => (
            <tr key={r.spec.id}><td>{r.spec.label}</td><td><CellText cell={r.cells.user} audience={audience} /></td></tr>
          ))}
        </tbody>
      </table>
      {client
        ? <p className={styles.legend}>
            <span className={styles.noRow}>{CLIENT_TEXT.noData}</span>: no hubo actividad registrada en el periodo ·{' '}
            <span className={styles.zero}>0</span>: hubo actividad y suma cero · % = parte de las lecturas de esa fuente ·{' '}
            <sup>*</sup> cifra provisional · ORGA y MECA se muestran por separado.
          </p>
        : <p className={styles.legend}>
            <span className={styles.noRow}>sin fila</span>: ninguna fila en la ventana · <span className={styles.zero}>0</span>:
            hay filas y suman cero · % = parte de las lecturas de esa fuente · <sup>*</sup> incluye buckets sin sellar ·
            ORGA y MECA no se mezclan: la mezcla depende del peso mecánico configurado y se calcula al leer.
          </p>}
      <SliceThreeNote present={read.cells !== null} audience={audience} />
    </main>
  )
}

function SentimentTable({ panels, audience, selected }: { panels: SentimentPanel[]; audience: Audience; selected: number }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr><th>Fuente</th>{SENTIMENT_STATES.map((st) => <th key={st}>{st}</th>)}<th>Lecturas</th><th>Cierres</th></tr>
      </thead>
      <tbody>
        {panels.map((p) => (
          <tr key={p.source}>
            <td>
              {p.source.toUpperCase()}<br />
              <Declared what={p.source === 'orga' ? 'orga_conversation' : 'meca_rum'} by={p.declaredBy}
                audience={audience} selected={selected} />
            </td>
            {SENTIMENT_STATES.map((st) => <td key={st}><CellText cell={p.states[st]} pct audience={audience} /></td>)}
            <td><CellText cell={p.total} audience={audience} /></td>
            <td>{p.source === 'orga' ? <CellText cell={p.closings} audience={audience} /> : <span className={styles.noRow}>no aplica</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
