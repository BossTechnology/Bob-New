// §5.2 GET /api/metrics — latest snapshot for all five metrics.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'

const METRICS = ['res', 'aba', 'des', 'der', 'alu']

export async function GET(request: NextRequest) {
  try {
    const { org_id } = await requireAuth()
    enforceRateLimit(`metrics:${org_id}`, LIMITS.general)

    const window = request.nextUrl.searchParams.get('window') || 'live'
    const channel = request.nextUrl.searchParams.get('channel') || 'all'

    const sb = await getRouteClient()
    const { data, error } = await sb.from('metric_snapshots')
      .select('*').eq('org_id', org_id).eq('window', window).eq('channel_id', channel)
      .order('recorded_at', { ascending: false }).limit(200)
    if (error) throw error

    // Keep only the most recent row per metric.
    const latest: Record<string, unknown> = {}
    for (const row of data || []) {
      const m = (row as { metric: string }).metric
      if (!latest[m]) latest[m] = row
    }
    const result = METRICS.map((m) => latest[m]).filter(Boolean)
    return ok(result)
  } catch (e) {
    return handle(e)
  }
}
