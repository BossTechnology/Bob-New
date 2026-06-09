// §5.10 GET /api/health — public health probe (no auth).
import { getServiceClient } from '@/lib/supabase'

export async function GET() {
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
