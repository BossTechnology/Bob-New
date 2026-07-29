// BOb v3 · GET    /api/config/responses/:thresholdId — list responses for a threshold.
//          PUT    /api/config/responses/:id           — update a response rule.
//          DELETE /api/config/responses/:id           — delete a response rule.
// Per spec, GET treats the path param as a threshold_id; PUT/DELETE treat it as
// the response rule's own id.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, badReq, handle } from '@/lib/api-response'

const UPDATABLE = [
  'type', 'name', 'channel_ids', 'subject', 'message',
  'webhook_url', 'webhook_method', 'webhook_payload',
]

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const { id: thresholdId } = await ctx.params
    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('response_rules')
      .select('id, type, name, channel_ids, subject, message, webhook_url, webhook_method')
      .eq('org_id', org_id)
      .eq('threshold_id', thresholdId)
    if (error) throw error
    return ok({ responses: data ?? [] })
  } catch (e) {
    return handle(e)
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { id } = await ctx.params
    const body = await request.json().catch(() => null)
    if (!body) return badReq('Invalid body')
    const patch: Record<string, unknown> = {}
    for (const k of UPDATABLE) if (k in body) patch[k] = body[k]
    if (!Object.keys(patch).length) return badReq('No updatable fields provided')

    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('response_rules')
      .update(patch)
      .eq('id', id)
      .eq('org_id', org_id)
      .select()
      .single()
    if (error) throw error
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { id } = await ctx.params
    const sb = await getRouteClient()
    const { error } = await sb.from('response_rules').delete().eq('id', id).eq('org_id', org_id)
    if (error) throw error
    return ok({ deleted: true })
  } catch (e) {
    return handle(e)
  }
}
