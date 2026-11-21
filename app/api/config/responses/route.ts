// BOb v3 · POST /api/config/responses — create a response rule attached to a
// threshold, an anomaly rule, or a text (content) rule.
import { NextRequest } from 'next/server'
import { configDb } from '@/lib/bob/config-db.ts'
import { requireAuth } from '@/lib/auth'
import { created, badReq, handle } from '@/lib/api-response'
import { isBox } from '@/lib/bob/runtime.ts'
import { actionNeedsBinding } from '@/lib/bob/config-db.ts'

const TYPES = ['alert', 'alarm', 'action']
const WEBHOOK = ['webhook_url', 'webhook_method', 'webhook_payload']

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const body = await request.json().catch(() => null)
    if (!body || !TYPES.includes(body.type)) return badReq('Invalid response type')
    if (!body.threshold_id && !body.anomaly_rule_id && !body.text_rule_id) {
      return badReq('threshold_id, anomaly_rule_id, or text_rule_id is required')
    }
    // In the box an action needs an AutoBotz binding (bob.response_rules,
    // Slice 6), which the simulator does not send yet; and bob has no webhook
    // columns. Refused plainly instead of failing a CHECK.
    if (isBox() && body.type === 'action') return actionNeedsBinding()
    const row: Record<string, unknown> = {
      org_id,
      threshold_id: body.threshold_id ?? null,
      anomaly_rule_id: body.anomaly_rule_id ?? null,
      text_rule_id: body.text_rule_id ?? null,
      type: body.type,
      name: body.name ?? '',
      channel_ids: body.channel_ids ?? [],
      subject: body.subject ?? '',
      message: body.message ?? '',
      webhook_url: body.webhook_url ?? null,
      webhook_method: body.webhook_method ?? 'POST',
      webhook_payload: body.webhook_payload ?? null,
    }
    if (isBox()) for (const k of WEBHOOK) delete row[k]
    const sb = await configDb(org_id)
    const { data, error } = await sb.from('response_rules').insert(row).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
