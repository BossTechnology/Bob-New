// BOb v3 · GET /api/config/alerts/summary — aggregated counts for the
// Intelligence modal Summary pills, derived from alert_log.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

type Row = { alert_type: string; severity: string | null }

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('alert_log')
      .select('alert_type, severity')
      .eq('org_id', org_id)
    if (error) throw error
    const rows = (data ?? []) as Row[]
    return ok({
      critical: rows.filter((r) => r.severity === 'critical').length,
      warning: rows.filter((r) => r.severity === 'warning').length,
      recovered: rows.filter((r) => r.alert_type === 'recovery').length,
      keyword: rows.filter((r) => r.alert_type === 'keyword').length,
      total: rows.length,
    })
  } catch (e) {
    return handle(e)
  }
}
