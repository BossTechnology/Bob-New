// §5.5 GET /api/anomalies/summary — type/status aggregate counts.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`anomalies:${org_id}`, LIMITS.general)
    const sb = await getRouteClient()
    const { data, error } = await sb.from('anomalies').select('type, status').eq('org_id', org_id)
    if (error) throw error
    const rows = (data || []) as { type: string; status: string }[]
    return ok({
      anomalies: rows.filter((r) => r.type === 'anomaly').length,
      incidents: rows.filter((r) => r.type === 'incident').length,
      issues: rows.filter((r) => r.type === 'issue').length,
      resolved: rows.filter((r) => r.status === 'resolved').length,
      total: rows.length,
    })
  } catch (e) {
    return handle(e)
  }
}
