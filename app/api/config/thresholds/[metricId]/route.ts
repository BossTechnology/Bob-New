// BOb v3 · GET /api/config/thresholds/:metricId — one config + its responses.
//          PUT /api/config/thresholds/:metricId — upsert on (org_id, metric_id).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, badReq, handle } from '@/lib/api-response'

const PEAK_MODES = ['manual', 'observed', 'off']

export async function GET(_req: NextRequest, ctx: { params: Promise<{ metricId: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const { metricId } = await ctx.params
    const sb = await getRouteClient()
    const { data: cfg, error } = await sb
      .from('threshold_configs')
      .select('id, metric_id, upper_bound, lower_bound, peak_mode, peak_windows')
      .eq('org_id', org_id)
      .eq('metric_id', metricId)
      .maybeSingle()
    if (error) throw error
    if (!cfg) return ok(null)
    const { data: responses, error: rErr } = await sb
      .from('response_rules')
      .select('*')
      .eq('org_id', org_id)
      .eq('threshold_id', cfg.id)
    if (rErr) throw rErr
    return ok({ ...cfg, responses: responses ?? [] })
  } catch (e) {
    return handle(e)
  }
}

export async function PUT(request: NextRequest, ctx: { params: Promise<{ metricId: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { metricId } = await ctx.params
    const body = await request.json().catch(() => null)
    if (!body) return badReq('Invalid body')
    if (body.peak_mode && !PEAK_MODES.includes(body.peak_mode)) return badReq('Invalid peak_mode')

    const row = {
      org_id,
      metric_id: metricId,
      upper_bound: body.upper_bound ?? null,
      lower_bound: body.lower_bound ?? null,
      peak_mode: body.peak_mode ?? 'off',
      peak_windows: body.peak_windows ?? [],
      updated_at: new Date().toISOString(),
    }
    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('threshold_configs')
      .upsert(row, { onConflict: 'org_id,metric_id' })
      .select('id, metric_id, upper_bound, lower_bound, peak_mode, peak_windows')
      .single()
    if (error) throw error
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}
