// §8.4 GET /api/twilio/twiml?alert_id= — TwiML voice script for critical alerts.
import { NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import type { BobAlert } from '@/lib/types'

function xml(body: string) {
  return new Response(`<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`, {
    headers: { 'Content-Type': 'text/xml' },
  })
}

export async function GET(request: NextRequest) {
  const alertId = request.nextUrl.searchParams.get('alert_id')
  if (!alertId) return xml('<Say>No alert specified.</Say>')
  try {
    const sb = getServiceClient()
    const { data } = await sb.from('alerts').select('*').eq('id', alertId).single()
    if (!data) return xml('<Say>Alert not found.</Say>')
    const a = data as BobAlert
    const msg = `BOb ${a.sev} alert. ${a.metric_name} reached ${a.value}, threshold ${a.threshold}. Press 1 to acknowledge, 2 to escalate.`
    return xml(`<Gather numDigits="1" action="/api/twilio/status?alert_id=${alertId}"><Say>${msg}</Say></Gather>`)
  } catch {
    return xml('<Say>Service error.</Say>')
  }
}
