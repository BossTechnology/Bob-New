// BOb v3 · GET    /api/config/textrules/:metricId — content rules for a text metric.
//          PUT    /api/config/textrules/:id        — update a content rule's fields.
//          DELETE /api/config/textrules/:id         — delete a content rule.
// GET treats the path param as a metric_id; PUT/DELETE treat it as a rule id
// (same dual-purpose-segment pattern as /api/config/anomalies/[key] — Next.js
// requires one dynamic-segment name per path position, so PUT/DELETE reuse
// the [metricId] folder). Not in the original spec — added so the simulator
// can persist edits instead of creating a duplicate row on every save.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, badReq, handle } from '@/lib/api-response'

const CONDITIONS = ['keyword', 'ranking', 'frequency', 'newentry']
const UPDATABLE = ['name', 'condition', 'value']

export async function GET(_req: NextRequest, ctx: { params: Promise<{ metricId: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const { metricId } = await ctx.params
    const sb = await getRouteClient()
    const { data: rules, error } = await sb
      .from('text_rules')
      .select('id, name, condition, value')
      .eq('org_id', org_id)
      .eq('metric_id', metricId)
      .order('created_at', { ascending: true })
    if (error) throw error

    // Attach responses to each rule (parity with /api/config/anomalies/:metricId).
    const ids = (rules ?? []).map((r) => r.id)
    let byRule: Record<string, unknown[]> = {}
    if (ids.length) {
      const { data: responses, error: rErr } = await sb
        .from('response_rules')
        .select('*')
        .eq('org_id', org_id)
        .in('text_rule_id', ids)
      if (rErr) throw rErr
      byRule = (responses ?? []).reduce((acc: Record<string, unknown[]>, r) => {
        const key = (r as { text_rule_id: string }).text_rule_id
        ;(acc[key] ||= []).push(r)
        return acc
      }, {})
    }

    const enriched = (rules ?? []).map((r) => ({ ...r, responses: byRule[r.id] ?? [] }))
    return ok({ rules: enriched })
  } catch (e) {
    return handle(e)
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ metricId: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { metricId: id } = await ctx.params
    const body = await request.json().catch(() => null)
    if (!body) return badReq('Invalid body')
    if (body.condition && !CONDITIONS.includes(body.condition)) return badReq('Invalid condition')

    const patch: Record<string, unknown> = {}
    for (const k of UPDATABLE) if (k in body) patch[k] = k === 'value' && body[k] != null ? String(body[k]) : body[k]
    if (!Object.keys(patch).length) return badReq('No updatable fields provided')

    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('text_rules')
      .update(patch)
      .eq('id', id)
      .eq('org_id', org_id)
      .select('id, name, condition, value')
      .single()
    if (error) throw error
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ metricId: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { metricId: id } = await ctx.params
    const sb = await getRouteClient()
    const { error } = await sb.from('text_rules').delete().eq('id', id).eq('org_id', org_id)
    if (error) throw error
    return ok({ deleted: true })
  } catch (e) {
    return handle(e)
  }
}
