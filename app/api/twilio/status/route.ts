// §8.4 POST /api/twilio/status — keypress + delivery status callback.
import { NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase'

export async function POST(request: NextRequest) {
  try {
    const alertId = request.nextUrl.searchParams.get('alert_id')
    const form = await request.formData().catch(() => null)
    const digit = form?.get('Digits')?.toString()
    const msgStatus = form?.get('MessageStatus')?.toString() || form?.get('CallStatus')?.toString()

    const sb = getServiceClient()
    if (alertId && digit === '1') {
      await sb.from('alerts').update({ status: 'acknowledged', acknowledged_at: new Date().toISOString() }).eq('id', alertId)
    } else if (alertId && digit === '2') {
      await sb.from('alerts').update({ status: 'investigating' }).eq('id', alertId)
    }
    if (msgStatus) {
      // Map provider delivery status onto notification_log (best-effort).
      const map: Record<string, string> = { delivered: 'delivered', failed: 'failed', undelivered: 'failed' }
      const mapped = map[msgStatus]
      if (mapped && alertId) await sb.from('notification_log').update({ status: mapped, delivered_at: new Date().toISOString() }).eq('alert_id', alertId)
    }
    return new Response('<?xml version="1.0" encoding="UTF-8"?><Response><Say>Recorded. Goodbye.</Say></Response>', { headers: { 'Content-Type': 'text/xml' } })
  } catch {
    return new Response('ok')
  }
}
