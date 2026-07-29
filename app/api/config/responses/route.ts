// BOb v3 · POST /api/config/responses — create a response rule attached to a
// threshold or an anomaly rule.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { created, badReq, handle } from '@/lib/api-response'

const TYPES = ['alert', 'alarm', 'action']

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const body = await request.json().catch(() => null)
    if (!body || !TYPES.includes(body.type)) return badReq('Invalid response type')
    if (!body.threshold_id && !body.anomaly_rule_id) {
      return badReq('threshold_id or anomaly_rule_id is required')
    }
    const row = {
      org_id,
      threshold_id: body.threshold_id ?? null,
      anomaly_rule_id: body.anomaly_rule_id ?? null,
      type: body.type,
      name: body.name ?? '',
      channel_ids: body.channel_ids ?? [],
      subject: body.subject ?? '',
      message: body.message ?? '',
      webhook_url: body.webhook_url ?? null,
      webhook_method: body.webhook_method ?? 'POST',
      webhook_payload: body.webhook_payload ?? null,
    }
    const sb = await getRouteClient()
    const { data, error } = await sb.from('response_rules').insert(row).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
