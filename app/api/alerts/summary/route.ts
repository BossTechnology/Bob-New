// §5.4 GET /api/alerts/summary — {critical, warning, total}.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`alerts:${org_id}`, LIMITS.general)
    const sb = await getRouteClient()
    const { data, error } = await sb.from('alerts').select('sev').eq('org_id', org_id).eq('status', 'active')
    if (error) throw error
    const rows = data || []
    return ok({
      critical: rows.filter((r) => (r as { sev: string }).sev === 'critical').length,
      warning: rows.filter((r) => (r as { sev: string }).sev === 'warning').length,
      total: rows.length,
    })
  } catch (e) {
    return handle(e)
  }
}
