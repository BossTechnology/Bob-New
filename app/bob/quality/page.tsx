// CALIDAD Y EXPERIENCIA of the demo over BOb's projections: NPS and
// Ánimo & Sentimiento (ORGA and MECA apart, counted by state, never blended
// and never summed across states), with the label failures that carry the
// true denominator of customer turns.
import { notFound } from 'next/navigation'
import { ACTOR_LABEL } from '@/lib/bob/matrix.ts'
import { requireScreen } from '@/lib/bob/screen-gate.ts'
import { buildQuality, SENTIMENT_STATES, type SentimentPanel } from '@/lib/bob/screens.ts'
import {
  BobConfigError, UnknownChannelError, boxOrgId, readQuality, type QualityRead,
} from '@/lib/bob/projection-reader.ts'
import {
  CellText, ChannelPicker, Declared, NoProjection, ReadError, ScreenNav, SliceThreeNote, Unavailable, Forbidden, windowQs,
} from '../screen-parts'
import styles from '../performance/matrix.module.css'

export const dynamic = 'force-dynamic'

type Search = Promise<{ from?: string; to?: string; channel?: string }>

export default async function QualityPage({ searchParams }: { searchParams: Search }) {
  const gate = await requireScreen()
  if (gate === 'unavailable') return <Unavailable />
  if (gate === 'forbidden') return <Forbidden />
  const q = await searchParams
  let read: QualityRead
  try {
    read = await readQuality(boxOrgId(), q)
  } catch (e) {
    if (e instanceof UnknownChannelError) notFound()
    if (!(e instanceof BobConfigError)) console.error('bob/quality: read failed', e)
    return <ReadError label="CALIDAD · proyecciones"
      message={e instanceof BobConfigError ? e.message : 'No se pudieron leer las proyecciones.'} />
  }
  const s = buildQuality(read.sentiment, read.counts, read.selected, read.cells)
  const { from, to } = read.window

  return (
    <main className={styles.page}>
      <ScreenNav current="quality" />
      <div className={styles.sectionLabel}>CALIDAD Y EXPERIENCIA · proyecciones reales (bob_app)</div>
      <p className={styles.meta}>
        ventana <code>{from.toISOString()}</code> → <code>{to.toISOString()}</code>
      </p>
      <ChannelPicker channels={read.channels} current={q.channel} qs={windowQs(from, to)} />

      <div className={styles.rendGrid}>
        <div className={styles.mRow}>
          <div className={styles.mName}>NPS<span className={styles.source}>{s.nps.note}</span></div>
          <div className={styles.mTotal}><NoProjection np={s.nps} /></div>
        </div>
      </div>

      <div className={styles.sectionLabel}>Ánimo &amp; Sentimiento · proj_sentiment (lecturas por estado)</div>
      <SentimentTable panels={[s.orga, s.meca]} />

      <div className={styles.sectionLabel}>Turnos sin etiqueta · proj_metric_counts</div>
      <table className={styles.table}>
        <thead><tr><th>Falla</th><th>{ACTOR_LABEL.user}</th></tr></thead>
        <tbody>
          {s.labelFailures.map((r) => (
            <tr key={r.spec.id}><td>{r.spec.label}</td><td><CellText cell={r.cells.user} /></td></tr>
          ))}
        </tbody>
      </table>
      <p className={styles.legend}>
        <span className={styles.noRow}>sin fila</span>: ninguna fila en la ventana · <span className={styles.zero}>0</span>:
        hay filas y suman cero · % = parte de las lecturas de esa fuente · <sup>*</sup> incluye buckets sin sellar ·
        ORGA y MECA no se mezclan: la mezcla depende del peso mecánico configurado y se calcula al leer.
      </p>
      <SliceThreeNote present={read.cells !== null} />
    </main>
  )
}

function SentimentTable({ panels }: { panels: SentimentPanel[] }) {
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
              <Declared what={p.source === 'orga' ? 'orga_conversation' : 'meca_rum'} by={p.declaredBy} />
            </td>
            {SENTIMENT_STATES.map((st) => <td key={st}><CellText cell={p.states[st]} pct /></td>)}
            <td><CellText cell={p.total} /></td>
            <td>{p.source === 'orga' ? <CellText cell={p.closings} /> : <span className={styles.noRow}>no aplica</span>}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
