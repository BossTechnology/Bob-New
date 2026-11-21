// The three screens as JSON, for the simulator to read later (inventario
// P-4). Same gate, same reads and same builders as the /bob pages: a figure
// with no row arrives as { kind: 'no_row' }, never as 0.
import { screenGate } from './screen-gate.ts'
import { BobConfigError, UnknownChannelError, boxOrgId } from './projection-reader.ts'

type Query = { from?: string; to?: string; channel?: string }

export async function screenJson<T>(request: Request, read: (orgId: string, q: Query) => Promise<T>) {
  const gate = await screenGate()
  if (gate === 'not_found') return Response.json({ ok: false, error: 'Not found' }, { status: 404 })
  if (gate === 'login') return Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
  if (gate === 'forbidden') return Response.json({ ok: false, error: 'Forbidden' }, { status: 403 })
  if (gate === 'unavailable') return Response.json({ ok: false, error: 'Identity unavailable' }, { status: 503 })
  const p = new URL(request.url).searchParams
  const q: Query = {
    from: p.get('from') ?? undefined, to: p.get('to') ?? undefined, channel: p.get('channel') ?? undefined,
  }
  try {
    return Response.json({ ok: true, data: await read(boxOrgId(), q) }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) {
    if (e instanceof UnknownChannelError) return Response.json({ ok: false, error: 'Unknown channel' }, { status: 404 })
    if (e instanceof BobConfigError) return Response.json({ ok: false, error: e.message }, { status: 400 })
    console.error('api/bob: read failed', e)
    return Response.json({ ok: false, error: 'Read failed' }, { status: 500 })
  }
}
