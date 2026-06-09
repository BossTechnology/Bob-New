// §5.3 GET /api/interactions/by-metric — feed filtered by metric type.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, badReq, handle } from '@/lib/api-response'
import { metricToType } from '@/lib/utils'

export async function GET(request: NextRequest) {
  try {
    const { org_id } = await requireAuth()
    enforceRateLimit(`interactions:${org_id}`, LIMITS.general)
    const metric = request.nextUrl.searchParams.get('metric')
    if (!metric) return badReq('Missing metric')
    const limit = Math.min(Number(request.nextUrl.searchParams.get('limit') || '50'), 200)

    const sb = await getRouteClient()
    const { data, error } = await sb.from('interactions').select('*')
      .eq('org_id', org_id).eq('type', metricToType(metric))
      .order('occurred_at', { ascending: false }).limit(limit)
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}
