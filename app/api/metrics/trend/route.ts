// §5.2 GET /api/metrics/trend — time-series for sparklines.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, badReq, handle } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { org_id } = await requireAuth()
    enforceRateLimit(`metrics:${org_id}`, LIMITS.general)
    const sp = request.nextUrl.searchParams
    const metric = sp.get('metric')
    if (!metric) return badReq('Missing metric')
    const window = sp.get('window') || '24h'
    const points = Math.min(Number(sp.get('points') || '48'), 200)

    const sb = await getRouteClient()
    const { data, error } = await sb.from('metric_snapshots')
      .select('total, recorded_at').eq('org_id', org_id).eq('metric', metric).eq('window', window).eq('channel_id', 'all')
      .order('recorded_at', { ascending: false }).limit(points)
    if (error) throw error
    return ok((data || []).reverse())
  } catch (e) {
    return handle(e)
  }
}
