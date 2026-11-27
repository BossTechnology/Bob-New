// INTERACCIONES of the demo over BOb's projections: Sesiones, Canales and
// Tiempo Prom., read as bob_app under the box's org. A figure with no row is
// "sin fila", never 0; a figure no projection carries is "sin proyección".
import { notFound } from 'next/navigation'
import { requireScreen } from '@/lib/bob/screen-gate.ts'
import {
  BobConfigError, UnknownChannelError, boxOrgId, readInteractions, type InteractionsRead,
} from '@/lib/bob/projection-reader.ts'
import { ReadError, Unavailable, Forbidden } from '../screen-parts'
import { InteractionsView } from './interactions-view'

export const dynamic = 'force-dynamic'

type Search = Promise<{ from?: string; to?: string; channel?: string }>

export default async function InteractionsPage({ searchParams }: { searchParams: Search }) {
  const gate = await requireScreen()
  if (gate === 'unavailable') return <Unavailable />
  if (gate === 'forbidden') return <Forbidden />
  const q = await searchParams
  let read: InteractionsRead
  try {
    read = await readInteractions(boxOrgId(), q)
  } catch (e) {
    if (e instanceof UnknownChannelError) notFound()
    if (!(e instanceof BobConfigError)) console.error('bob/interactions: read failed', e)
    return <ReadError label="INTERACCIONES · proyecciones"
      message={e instanceof BobConfigError ? e.message : 'No se pudieron leer las proyecciones.'}
      audience={gate.audience} />
  }
  return <InteractionsView read={read} channel={q.channel} audience={gate.audience} />
}
