// BOb v3 · POST /api/config/textrules — create a content rule for a text metric.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { created, badReq, handle } from '@/lib/api-response'

const METRICS = ['temas', 'acciones', 'faq', 'words']
const CONDITIONS = ['keyword', 'ranking', 'frequency', 'newentry']

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const body = await request.json().catch(() => null)
    if (!body || !METRICS.includes(body.metric_id)) return badReq('Invalid metric_id')
    if (!CONDITIONS.includes(body.condition)) return badReq('Invalid condition')

    const row = {
      org_id,
      metric_id: body.metric_id,
      name: body.name ?? '',
      condition: body.condition,
      value: body.value != null ? String(body.value) : null,
    }
    const sb = await getRouteClient()
    const { data, error } = await sb.from('text_rules').insert(row).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
