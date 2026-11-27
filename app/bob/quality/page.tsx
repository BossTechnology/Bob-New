// CALIDAD Y EXPERIENCIA of the demo over BOb's projections: NPS and
// Ánimo & Sentimiento (ORGA and MECA apart, counted by state, never blended
// and never summed across states), with the label failures that carry the
// true denominator of customer turns.
import { notFound } from 'next/navigation'
import { requireScreen } from '@/lib/bob/screen-gate.ts'
import {
  BobConfigError, UnknownChannelError, boxOrgId, readQuality, type QualityRead,
} from '@/lib/bob/projection-reader.ts'
import { ReadError, Unavailable, Forbidden } from '../screen-parts'
import { QualityView } from './quality-view'

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
      message={e instanceof BobConfigError ? e.message : 'No se pudieron leer las proyecciones.'}
      audience={gate.audience} />
  }
  return <QualityView read={read} channel={q.channel} audience={gate.audience} />
}
