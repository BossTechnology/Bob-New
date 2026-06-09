// §5.4 PATCH /api/alerts/:id — update alert lifecycle status.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, badReq, handle } from '@/lib/api-response'

const STATUSES = ['active', 'acknowledged', 'investigating', 'resolved', 'suppressed', 'expired']

export async function PATCH(request: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { id } = await ctx.params
    const body = await request.json().catch(() => null)
    if (!body || !STATUSES.includes(body.status)) return badReq('Invalid status')

    const patch: Record<string, unknown> = { status: body.status }
    if (body.resolution_note) patch.resolution_note = body.resolution_note
    if (body.status === 'acknowledged') patch.acknowledged_at = new Date().toISOString()
    if (body.status === 'resolved') patch.resolved_at = new Date().toISOString()

    const sb = await getRouteClient()
    const { data, error } = await sb.from('alerts').update(patch)
      .eq('id', id).eq('org_id', org_id).select().single()
    if (error) throw error
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
