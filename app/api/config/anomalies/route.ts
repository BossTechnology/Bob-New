// BOb v3 · POST /api/config/anomalies — create an anomaly rule (known or unknown).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { created, badReq, handle } from '@/lib/api-response'

const RULE_TYPES = ['known', 'unknown_critical', 'unknown_warning']
const CONDITIONS = ['contains', 'frequency', 'pattern']

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const body = await request.json().catch(() => null)
    if (!body || !body.metric_id) return badReq('metric_id is required')
    if (!RULE_TYPES.includes(body.rule_type)) return badReq('Invalid rule_type')
    if (body.condition && !CONDITIONS.includes(body.condition)) return badReq('Invalid condition')

    const row = {
      org_id,
      metric_id: body.metric_id,
      rule_type: body.rule_type,
      name: body.name ?? '',
      condition: body.condition ?? null,
      keywords: body.keywords ?? null,
      freq_threshold: body.freq_threshold ?? null,
    }
    const sb = await getRouteClient()
    const { data, error } = await sb.from('anomaly_rules').insert(row).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
