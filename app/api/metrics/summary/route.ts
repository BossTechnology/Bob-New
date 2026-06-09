// §5.2 GET /api/metrics/summary — header panel data (INTERACCIONES).
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth()
    enforceRateLimit(`metrics:${org_id}`, LIMITS.general)
    const sb = await getRouteClient()

    const [sessionsRes, channelsRes, anomaliesRes] = await Promise.all([
      sb.from('metric_snapshots').select('total').eq('org_id', org_id).eq('metric', 'sessions').eq('window', 'live').eq('channel_id', 'all').order('recorded_at', { ascending: false }).limit(1).maybeSingle(),
      sb.from('channels').select('id', { count: 'exact', head: true }).eq('org_id', org_id).eq('active', true),
      sb.from('anomalies').select('id', { count: 'exact', head: true }).eq('org_id', org_id).neq('status', 'resolved'),
    ])

    return ok({
      sessions: (sessionsRes.data as { total?: number } | null)?.total ?? 0,
      avgTime: 0,
      activeChannels: channelsRes.count ?? 0,
      activeAnomalies: anomaliesRes.count ?? 0,
    })
  } catch (e) {
    return handle(e)
  }
}
