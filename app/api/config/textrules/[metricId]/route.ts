// BOb v3 · GET /api/config/textrules/:metricId — content rules for a text metric.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

export async function GET(_req: NextRequest, ctx: { params: Promise<{ metricId: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const { metricId } = await ctx.params
    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('text_rules')
      .select('id, name, condition, value')
      .eq('org_id', org_id)
      .eq('metric_id', metricId)
      .order('created_at', { ascending: true })
    if (error) throw error
    return ok({ rules: data ?? [] })
  } catch (e) {
    return handle(e)
  }
}
