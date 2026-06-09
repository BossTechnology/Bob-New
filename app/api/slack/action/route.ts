// §8.5 POST /api/slack/action — interactive button callbacks (Acknowledge).
// NOTE: production must verify the Slack signing secret (X-Slack-Signature).
// Implemented as a best-effort check; full HMAC verification is a follow-up.
import { NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData().catch(() => null)
    const payloadRaw = form?.get('payload')?.toString()
    if (!payloadRaw) return Response.json({ ok: false }, { status: 400 })
    const payload = JSON.parse(payloadRaw)
    const action = payload?.actions?.[0]
    const alertId = action?.value

    if (action?.action_id === 'acknowledge' && alertId) {
      const sb = getServiceClient()
      await sb.from('alerts').update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() }).eq('id', alertId)
    }
    return Response.json({ text: 'Alert acknowledged in BOb.' })
  } catch {
    return Response.json({ ok: false }, { status: 400 })
  }
}
