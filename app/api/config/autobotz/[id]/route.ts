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

const COLS = 'id, type, label, provider, scope_kind, scope_ref, reference, binding, enabled, requires_approval, mutative, verify_state, verified_at, verify_msg'

export async function PUT(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { id } = await ctx.params
    const body = await request.json().catch(() => null)
    if (!body) return badReq('Invalid body')

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if ('label' in body) patch.label = body.label
    if ('scope_kind' in body) patch.scope_kind = body.scope_kind
    if ('scope_ref' in body) patch.scope_ref = body.scope_ref
    if ('enabled' in body) patch.enabled = body.enabled
    if ('reference' in body) patch.reference = body.reference
    if ('binding' in body) patch.binding = body.binding
    // BR-3 cannot be unset once given: the CHECK refuses NULL on update too.
    if ('mutative' in body) patch.mutative = body.mutative
    if (Object.keys(patch).length === 1) return badReq('Nothing to update')

    // A changed target makes the previous verification meaningless.
    if ('reference' in body || 'binding' in body) {
      patch.verify_state = 'unverified'
      patch.verified_at = null
      patch.verify_msg = ''
    }

    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('autobotz')
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
    const { error } = await sb.from('autobotz').delete().eq('id', id).eq('org_id', org_id)
    if (error) throw error
    return ok({ deleted: true })
  } catch (e) {
    return handle(e)
  }
}
