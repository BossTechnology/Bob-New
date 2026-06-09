// §5.5 GET /api/anomalies/urgent — top 3 unresolved, critical-first.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`anomalies:${org_id}`, LIMITS.general)
    const sb = await getRouteClient()
    const { data, error } = await sb.from('anomalies').select('*')
      .eq('org_id', org_id).neq('status', 'resolved')
      .order('sev', { ascending: true }).order('occurred_at', { ascending: false }).limit(3)
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}
