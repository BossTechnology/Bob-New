// §5.4 GET /api/alerts/by-metric/:metricId — alerts scoped to one metric.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'

export async function GET(_request: Request, ctx: { params: Promise<{ metricId: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`alerts:${org_id}`, LIMITS.general)
    const { metricId } = await ctx.params
    const sb = await getRouteClient()
    const { data, error } = await sb.from('alerts').select('*')
      .eq('org_id', org_id).eq('metric_id', metricId)
      .order('occurred_at', { ascending: false }).limit(50)
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}
