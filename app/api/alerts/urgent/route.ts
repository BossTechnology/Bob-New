// §5.4 GET /api/alerts/urgent — top 3 active alerts, critical-first.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`alerts:${org_id}`, LIMITS.general)
    const sb = await getRouteClient()
    const { data, error } = await sb.from('alerts').select('*')
      .eq('org_id', org_id).eq('status', 'active')
      .order('sev', { ascending: true }).order('occurred_at', { ascending: false }).limit(3)
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}
