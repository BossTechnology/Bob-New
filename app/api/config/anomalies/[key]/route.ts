// BOb v3 · GET    /api/config/anomalies/:metricId — rules grouped known/unknown.
//          DELETE /api/config/anomalies/:id        — delete an anomaly rule.
// GET treats the path param as a metric_id; DELETE treats it as a rule id.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

type Rule = {
  id: string
  rule_type: string
  name: string
  condition: string | null
  keywords: string | null
  freq_threshold: number | null
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const { key: metricId } = await ctx.params
    const sb = await getRouteClient()

    const { data: rules, error } = await sb
      .from('anomaly_rules')
      .select('id, rule_type, name, condition, keywords, freq_threshold')
      .eq('org_id', org_id)
      .eq('metric_id', metricId)
    if (error) throw error

    // Attach responses to each rule.
    const ids = (rules ?? []).map((r) => (r as Rule).id)
    let byRule: Record<string, unknown[]> = {}
    if (ids.length) {
      const { data: responses, error: rErr } = await sb
        .from('response_rules')
        .select('*')
        .eq('org_id', org_id)
        .in('anomaly_rule_id', ids)
      if (rErr) throw rErr
      byRule = (responses ?? []).reduce((acc: Record<string, unknown[]>, r) => {
        const key = (r as { anomaly_rule_id: string }).anomaly_rule_id
        ;(acc[key] ||= []).push(r)
        return acc
      }, {})
    }

    const known: unknown[] = []
    const unknown: { critical: unknown[]; warning: unknown[] } = { critical: [], warning: [] }
    for (const raw of rules ?? []) {
      const r = raw as Rule
      const enriched = { ...r, responses: byRule[r.id] ?? [] }
      if (r.rule_type === 'known') known.push(enriched)
      else if (r.rule_type === 'unknown_critical') unknown.critical.push(enriched)
      else if (r.rule_type === 'unknown_warning') unknown.warning.push(enriched)
    }
    return ok({ known, unknown })
  } catch (e) {
    return handle(e)
  }
}

export async function DELETE(_req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { key: id } = await ctx.params
    const sb = await getRouteClient()
    const { error } = await sb.from('anomaly_rules').delete().eq('id', id).eq('org_id', org_id)
    if (error) throw error
    return ok({ deleted: true })
  } catch (e) {
    return handle(e)
  }
}
