// §5.2 GET /api/sentiment — weighted sentiment distribution.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { org_id } = await requireAuth()
    enforceRateLimit(`metrics:${org_id}`, LIMITS.general)
    const channels = request.nextUrl.searchParams.get('channels')
    const channelId = channels ? channels.split(',')[0] : 'all'

    const sb = await getRouteClient()
    const { data, error } = await sb.from('sentiment_readings')
      .select('*').eq('org_id', org_id).eq('channel_id', channelId)
      .order('computed_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return ok(data || { angry: 0, unsatisfied: 0, satisfied: 100, content: 0, happy: 0 })
  } catch (e) {
    return handle(e)
  }
}
