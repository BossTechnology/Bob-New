// BOb v3 · GET /api/config/alerts — recent alert_log events for the org.
// Namespaced under /api/config to stay isolated from the Backend Discovery
// v1.0 /api/alerts subsystem (which serves the separate `alerts` table).
// Query params: ?metric_id=&severity=&limit=&offset=
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const searchParams = request.nextUrl.searchParams
    const metricId = searchParams.get('metric_id')
    const severity = searchParams.get('severity')
    const limit = Math.min(Number(searchParams.get('limit')) || 50, 200)
    const offset = Number(searchParams.get('offset')) || 0

    const sb = await getRouteClient()
    let q = sb
      .from('alert_log')
      .select('id, metric_id, metric_name, alert_type, value, threshold, severity, responses_fired, created_at')
      .eq('org_id', org_id)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)
    if (metricId) q = q.eq('metric_id', metricId)
    if (severity) q = q.eq('severity', severity)

    const { data, error } = await q
    if (error) throw error
    return ok({ alerts: data ?? [] })
  } catch (e) {
    return handle(e)
  }
}
