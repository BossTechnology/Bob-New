// §5.7 POST /api/ai/insights — Explanation / Recommendation / Prediction.
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { bobeeService } from '@/services'
import { ok, badReq, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const { user_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`ai:${user_id}`, LIMITS.ai)
    const body = await request.json().catch(() => null)
    if (!body?.dashboardState) return badReq('Missing dashboardState')
    const context = bobeeService.buildContext(body.dashboardState)
    return ok(await bobeeService.generateInsights(context, body.lang || 'es'))
  } catch (e) {
    return handle(e)
  }
}
