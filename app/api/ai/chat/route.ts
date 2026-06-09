// §5.7 POST /api/ai/chat — BObee chat. Persists conversation history.
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { getServiceClient } from '@/lib/supabase'
import { bobeeService } from '@/services'
import { ok, badReq, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const { user_id, org_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`ai:${user_id}`, LIMITS.ai)
    const body = await request.json().catch(() => null)
    if (!Array.isArray(body?.messages)) return badReq('Missing messages')

    const context = body.dashboardState ? bobeeService.buildContext(body.dashboardState) : ''
    const reply = await bobeeService.chat(body.messages, context, body.lang || 'es', body.metricScope)

    if (body.session_id) {
      const sb = getServiceClient()
      await sb.from('bobee_conversations').insert({
        org_id, user_id, session_id: body.session_id, metric_scope: body.metricScope || null,
        messages: [...body.messages, { role: 'assistant', content: reply }],
      })
    }
    return ok({ response: reply })
  } catch (e) {
    return handle(e)
  }
}
