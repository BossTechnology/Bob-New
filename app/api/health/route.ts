// §5.10 GET /api/health — public health probe (no auth).
//
// In the box it is the container's healthcheck (lib/bob/health.ts): bob_app
// and GoTrue in parallel, a 503 within 2 s when either does not answer.
// Outside the box, the demo's probe as before.
import { getServiceClient } from '@/lib/supabase'
import { isBox, boxOrgId, gotrueUrl } from '@/lib/bob/runtime.ts'
import { asBobApp } from '@/lib/bob/db.ts'
import { health } from '@/lib/bob/gotrue.ts'
import { boxHealth } from '@/lib/bob/health.ts'

export const dynamic = 'force-dynamic'

export async function GET() {
  if (isBox()) {
    return boxHealth({
      db: () => asBobApp(boxOrgId(), (c) => c.query('SELECT 1')),
      identity: () => health(gotrueUrl()),
    })
  }
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
