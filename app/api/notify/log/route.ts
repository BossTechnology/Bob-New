// §5.9 GET /api/notify/log — notification delivery log (admin).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin'])
    const sp = request.nextUrl.searchParams
    const limit = Math.min(Number(sp.get('limit') || '50'), 200)
    const sb = await getRouteClient()
    let q = sb.from('notification_log').select('*').eq('org_id', org_id)
      .order('sent_at', { ascending: false }).limit(limit)
    if (sp.get('alert_id')) q = q.eq('alert_id', sp.get('alert_id')!)
    const { data, error } = await q
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}
