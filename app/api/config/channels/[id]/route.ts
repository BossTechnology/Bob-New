// BOb v3 · PUT    /api/config/channels/:id — update label and/or values.
//          DELETE /api/config/channels/:id — delete a channel, first disconnecting
//          it from any response_rules that reference it (confirmRemoveCh parity).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, badReq, handle } from '@/lib/api-response'

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { id } = await ctx.params
    const body = await request.json().catch(() => null)
    if (!body) return badReq('Invalid body')
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('label' in body) patch.label = body.label
    if ('values' in body) patch.values = body.values
    if (Object.keys(patch).length === 1) return badReq('Nothing to update')

    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('notification_channels')
      .update(patch)
      .eq('id', id)
      .eq('org_id', org_id)
      .select('id, type, label, values')
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

    // Disconnect this channel from every response rule that references it.
    const { data: refs, error: refErr } = await sb
      .from('response_rules')
      .select('id, channel_ids')
      .eq('org_id', org_id)
      .contains('channel_ids', [id])
    if (refErr) throw refErr

    let disconnected = 0
    for (const rule of refs ?? []) {
      const next = ((rule as { channel_ids: string[] }).channel_ids || []).filter((c) => c !== id)
      const { error: updErr } = await sb
        .from('response_rules')
        .update({ channel_ids: next })
        .eq('id', (rule as { id: string }).id)
        .eq('org_id', org_id)
      if (updErr) throw updErr
      disconnected++
    }

    const { error } = await sb.from('notification_channels').delete().eq('id', id).eq('org_id', org_id)
    if (error) throw error
    return ok({ deleted: true, dependencies_disconnected: disconnected })
  } catch (e) {
    return handle(e)
  }
}
