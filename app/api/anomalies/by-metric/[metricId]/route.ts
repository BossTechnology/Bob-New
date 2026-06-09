// §5.5 GET /api/anomalies/by-metric/:metricId — anomalies for one metric.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'

export async function GET(_request: Request, ctx: { params: Promise<{ metricId: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`anomalies:${org_id}`, LIMITS.general)
    const { metricId } = await ctx.params
    const sb = await getRouteClient()
    const { data, error } = await sb.from('anomalies').select('*')
      .eq('org_id', org_id).eq('metric', metricId)
      .order('occurred_at', { ascending: false }).limit(50)
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}
