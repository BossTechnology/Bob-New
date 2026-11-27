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
  CellText, ChannelPicker, LegendView, NoProjection, NoteLine, PaintView, ReadError, ScreenHeader, ScreenNav, Unavailable, Forbidden, windowQs,
} from '../screen-parts'
import {
  audienceFor, declared, labelFailuresTitle, paintNotApplicable, qualityLegend, readError, sentimentLabel, sentimentTitle,
  sliceThreeNote, techNote,
  type Audience,
} from '@/lib/bob/screen-copy.ts'
import styles from '../performance/matrix.module.css'

export const dynamic = 'force-dynamic'

type Search = Promise<{ from?: string; to?: string; channel?: string }>

export default async function QualityPage({ searchParams }: { searchParams: Search }) {
  const gate = await requireScreen()
  if (gate === 'unavailable') return <Unavailable />
  if (gate === 'forbidden') return <Forbidden />
  const a = audienceFor(gate.role)
  const q = await searchParams
  let read: QualityRead
  try {
    read = await readQuality(boxOrgId(), q)
  } catch (e) {
    if (e instanceof UnknownChannelError) notFound()
    if (!(e instanceof BobConfigError)) console.error('bob/quality: read failed', e)
    const err = readError('quality', a, e instanceof BobConfigError ? e.message : null)
    return <ReadError label={err.label} message={err.message} />
  }
  const s = buildQuality(read.sentiment, read.counts, read.selected, read.cells)
  const { from, to } = read.window

  return (
    <main className={styles.page}>
      <ScreenNav current="quality" />
      <ScreenHeader screen="quality" a={a} from={from} to={to} watermark={false} />
      <ChannelPicker channels={read.channels} current={q.channel} qs={windowQs(from, to)} />

      <div className={styles.rendGrid}>
        <div className={styles.mRow}>
          <div className={styles.mName}>NPS<NoteLine note={techNote(s.nps.note, a)} /></div>
          <div className={styles.mTotal}><NoProjection np={s.nps} a={a} /></div>
        </div>
      </div>

      <div className={styles.sectionLabel}>{sentimentTitle(a)}</div>
      <SentimentTable panels={[s.orga, s.meca]} a={a} n={read.selected.length} />

      <div className={styles.sectionLabel}>{labelFailuresTitle(a)}</div>
      <table className={styles.table}>
        <thead><tr><th>Falla</th><th>{ACTOR_LABEL.user}</th></tr></thead>
        <tbody>
          {s.labelFailures.map((r) => (
            <tr key={r.spec.id}><td>{r.spec.label}</td><td><CellText cell={r.cells.user} a={a} /></td></tr>
          ))}
        </tbody>
      </table>
      <LegendView items={qualityLegend(a, read.cells !== null)} />
      <LegendView items={sliceThreeNote(a, read.cells !== null)} />
    </main>
  )
}

function SentimentTable({ panels, a, n }: { panels: SentimentPanel[]; a: Audience; n: number }) {
  return (
    <table className={styles.table}>
      <thead>
        <tr><th>Fuente</th>{SENTIMENT_STATES.map((st) => <th key={st}>{sentimentLabel(st, a)}</th>)}<th>Lecturas</th><th>Cierres</th></tr>
      </thead>
      <tbody>
        {panels.map((p) => {
          const note = declared(p.source === 'orga' ? 'orga_conversation' : 'meca_rum', p.declaredBy, a, n)
          return (
            <tr key={p.source}>
              <td>
                {p.source.toUpperCase()}
                {note ? <><br /><NoteLine note={note} /></> : null}
              </td>
              {SENTIMENT_STATES.map((st) => <td key={st}><CellText cell={p.states[st]} a={a} pct /></td>)}
              <td><CellText cell={p.total} a={a} /></td>
              <td>{p.source === 'orga' ? <CellText cell={p.closings} a={a} /> : <PaintView p={paintNotApplicable(a)} />}</td>
            </tr>
          )
        })}
      </tbody>
    </table>
  )
}
