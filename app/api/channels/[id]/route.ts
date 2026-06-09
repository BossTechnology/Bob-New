// §5.8 PATCH /api/channels/:id · DELETE (soft) /api/channels/:id (admin).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin'])
    const { id } = await ctx.params
    const body = await request.json().catch(() => ({}))
    const sb = await getRouteClient()
    const { data, error } = await sb.from('channels').update(body)
      .eq('id', id).eq('org_id', org_id).select().single()
    if (error) throw error
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin'])
    const { id } = await ctx.params
    const sb = await getRouteClient()
    const { data, error } = await sb.from('channels').update({ active: false })
      .eq('id', id).eq('org_id', org_id).select().single()
    if (error) throw error
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
