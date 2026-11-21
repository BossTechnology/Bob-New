// §5.10 GET /api/health — public health probe (no auth).
//
// In the box it is the container's healthcheck (insumos de Bzzz §4.2, punto
// 10): a SELECT as bob_app and GoTrue's /health. Down is not healthy: 503 when
// either does not answer, and the body says which. Outside the box, the demo's
// probe as before.
import { getServiceClient } from '@/lib/supabase'
import { isBox, boxOrgId, gotrueUrl } from '@/lib/bob/runtime.ts'
import { asBobApp } from '@/lib/bob/db.ts'
import { health } from '@/lib/bob/gotrue.ts'

export const dynamic = 'force-dynamic'

async function boxHealth() {
  let db = 'error'
  let identity = 'error'
  try {
    await asBobApp(boxOrgId(), (c) => c.query('SELECT 1'))
    db = 'ok'
  } catch (e) {
    console.error('health: bob_app read failed', e instanceof Error ? e.message : e)
  }
  try {
    identity = (await health(gotrueUrl())) ? 'ok' : 'error'
  } catch {
    identity = 'unconfigured'
  }
  const up = db === 'ok' && identity === 'ok'
  return Response.json({ status: up ? 'ok' : 'down', db, identity, version: '1.0.0' }, { status: up ? 200 : 503 })
}

export async function GET() {
  if (isBox()) return boxHealth()
  let db = 'unknown'
  try {
    const sb = getServiceClient()
    const { error } = await sb.from('organizations').select('id', { head: true, count: 'exact' }).limit(1)
    db = error ? 'error' : 'ok'
  } catch {
    db = 'unconfigured'
  }
  return Response.json({ status: 'ok', db, version: '1.0.0' })
}
