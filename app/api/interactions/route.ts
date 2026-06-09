// §5.3 GET /api/interactions (feed) · POST /api/interactions (service ingest).
import { NextRequest } from 'next/server'
import { getRouteClient, getServiceClient } from '@/lib/supabase'
import { requireAuth, requireService } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, created, badReq, handle } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { org_id } = await requireAuth()
    enforceRateLimit(`interactions:${org_id}`, LIMITS.general)
    const sp = request.nextUrl.searchParams
    const limit = Math.min(Number(sp.get('limit') || '50'), 200)

    const sb = await getRouteClient()
    let q = sb.from('interactions').select('*').eq('org_id', org_id)
      .order('occurred_at', { ascending: false }).limit(limit)
    if (sp.get('channel')) q = q.eq('channel_id', sp.get('channel')!)
    if (sp.get('type')) q = q.eq('type', sp.get('type')!)
    if (sp.get('since')) q = q.gte('occurred_at', sp.get('since')!)

    const { data, error } = await q
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    requireService(request)
    const body = await request.json().catch(() => null)
    if (!body || !body.org_id || !body.channel_id || !body.type || !body.actor) return badReq('Invalid interaction')
    const sb = getServiceClient()
    const { data, error } = await sb.from('interactions').insert(body).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
