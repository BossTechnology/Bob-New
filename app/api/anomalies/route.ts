// §5.5 GET /api/anomalies · POST /api/anomalies (service).
import { NextRequest } from 'next/server'
import { getRouteClient, getServiceClient } from '@/lib/supabase'
import { requireAuth, requireService } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, created, badReq, handle } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`anomalies:${org_id}`, LIMITS.general)
    const sp = request.nextUrl.searchParams
    const limit = Math.min(Number(sp.get('limit') || '50'), 200)

    const sb = await getRouteClient()
    let q = sb.from('anomalies').select('*').eq('org_id', org_id)
      .order('occurred_at', { ascending: false }).limit(limit)
    if (sp.get('type')) q = q.eq('type', sp.get('type')!)
    if (sp.get('metric')) q = q.eq('metric', sp.get('metric')!)
    if (sp.get('status')) q = q.eq('status', sp.get('status')!)

    const { data, error } = await q
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    requireService(request)
    const body = await request.json().catch(() => null)
    if (!body || !body.org_id || !body.metric || !body.title) return badReq('Invalid anomaly')
    const sb = getServiceClient()
    const { data, error } = await sb.from('anomalies').insert(body).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
