// Thin rendering of the Performance matrix over BOb's projections (BOB-7,
// "When there is something to look at"). The demo's RENDIMIENTO layout with
// real projection rows, unpolished. Each cell shows what was read: a value, a
// written zero, or no row at all. Nothing absent is turned into 0.
//
// In the box (BOB_CAJA=1) it is one of the three screens, behind the box's
// GoTrue session. Outside the box it is off unless BOB_PERF_MATRIX=1, never in
// Vercel production, and only with Supabase auth configured (screen-gate.ts).
// What it paints, and in whose words, is in performance-view.tsx.
import { notFound } from 'next/navigation'
import { requireScreen } from '@/lib/bob/screen-gate.ts'
import { Unavailable, Forbidden, ReadError } from '../screen-parts'
import {
  BobConfigError, UnknownChannelError, boxOrgId, readPerformance,
  type PerformanceRead,
} from '@/lib/bob/projection-reader.ts'
import { PerformanceView } from './performance-view'

export const dynamic = 'force-dynamic'

type Search = Promise<{ from?: string; to?: string; channel?: string }>

export default async function PerformanceMatrixPage({ searchParams }: { searchParams: Search }) {
  const gate = await requireScreen()
  if (gate === 'unavailable') return <Unavailable />
  if (gate === 'forbidden') return <Forbidden />
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
    return <ReadError label="RENDIMIENTO · proyecciones" message={msg} audience={gate.audience} />
  }
  return <PerformanceView read={read} channel={q.channel} audience={gate.audience} />
}
