// §5.4 GET /api/alerts · POST /api/alerts (service/admin).
import { NextRequest } from 'next/server'
import { getRouteClient, getServiceClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, created, badReq, handle } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`alerts:${org_id}`, LIMITS.general)
    const sp = request.nextUrl.searchParams
    const limit = Math.min(Number(sp.get('limit') || '50'), 200)

    const sb = await getRouteClient()
    let q = sb.from('alerts').select('*').eq('org_id', org_id)
      .order('occurred_at', { ascending: false }).limit(limit)
    if (sp.get('metric')) q = q.eq('metric_id', sp.get('metric')!)
    if (sp.get('sev')) q = q.eq('sev', sp.get('sev')!)
    if (sp.get('status')) q = q.eq('status', sp.get('status')!)
    if (sp.get('since')) q = q.gte('occurred_at', sp.get('since')!)

    const { data, error } = await q
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin'])
    const body = await request.json().catch(() => null)
    if (!body || !body.metric_id) return badReq('Invalid alert')
    const sb = getServiceClient()
    const { data, error } = await sb.from('alerts').insert({ ...body, org_id }).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
