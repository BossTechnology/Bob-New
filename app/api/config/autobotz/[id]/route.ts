// BOb v5.3 · PUT    /api/config/autobotz/:id — update a binding.
//            DELETE /api/config/autobotz/:id — delete a binding.
//
// Editing the reference or its inputs invalidates the verification: the old
// result was evidence about a different target. The simulator does the same on
// the client (`if(changed) ab.verify={state:'unverified',…}`), so the two agree.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, badReq, handle } from '@/lib/api-response'

const COLS = 'id, client_id, type, label, provider, scope, ref, config, verify_state, verify_ts, verify_msg'

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { id } = await ctx.params
    const body = await request.json().catch(() => null)
    if (!body) return badReq('Invalid body')

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('label' in body) patch.label = body.label
    if ('scope' in body) patch.scope = body.scope
    if ('ref' in body) patch.ref = body.ref
    if ('config' in body) patch.config = body.config
    if (Object.keys(patch).length === 1) return badReq('Nothing to update')

    // A changed target makes the previous verification meaningless.
    if ('ref' in body || 'config' in body) {
      patch.verify_state = 'unverified'
      patch.verify_ts = null
      patch.verify_msg = ''
    }

    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('autobotz_bindings')
      .update(patch)
      .eq('id', id)
      .eq('org_id', org_id)
      .select(COLS)
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
    const { error } = await sb.from('autobotz_bindings').delete().eq('id', id).eq('org_id', org_id)
    if (error) throw error
    return ok({ deleted: true })
  } catch (e) {
    return handle(e)
  }
}
