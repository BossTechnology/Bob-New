// §5.2 GET /api/metrics/:metric — single metric snapshot.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, notFound, handle } from '@/lib/api-response'

export async function GET(request: NextRequest, ctx: { params: Promise<{ metric: string }> }) {
  try {
    const { org_id } = await requireAuth()
    enforceRateLimit(`metrics:${org_id}`, LIMITS.general)
    const { metric } = await ctx.params
    const window = request.nextUrl.searchParams.get('window') || 'live'
    const channel = request.nextUrl.searchParams.get('channel') || 'all'

    const sb = await getRouteClient()
    const { data, error } = await sb.from('metric_snapshots')
      .select('*').eq('org_id', org_id).eq('metric', metric).eq('window', window).eq('channel_id', channel)
      .order('recorded_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    if (!data) return notFound()
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
