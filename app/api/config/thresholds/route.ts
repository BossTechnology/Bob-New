// BOb v3 · GET /api/config/thresholds — all threshold configs for the org.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('threshold_configs')
      .select('id, metric_id, upper_bound, lower_bound, peak_mode, peak_windows')
      .eq('org_id', org_id)
      .order('metric_id', { ascending: true })
    if (error) throw error
    return ok({ thresholds: data ?? [] })
  } catch (e) {
    return handle(e)
  }
}
