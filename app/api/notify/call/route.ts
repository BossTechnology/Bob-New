// §5.9 POST /api/notify/call — initiate Twilio voice call, critical only (service).
import { NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { requireService } from '@/lib/auth'
import { notificationService } from '@/services'
import { ok, badReq, notFound, handle } from '@/lib/api-response'
import type { BobAlert } from '@/lib/types'

export async function POST(request: NextRequest) {
  try {
    requireService(request)
    const body = await request.json().catch(() => null)
    if (!body?.alert_id || !Array.isArray(body?.recipients)) return badReq('Missing alert_id/recipients')
    const sb = getServiceClient()
    const { data } = await sb.from('alerts').select('*').eq('id', body.alert_id).single()
    if (!data) return notFound()
    const alert = data as BobAlert
    if (alert.sev !== 'critical') return badReq('Voice calls are critical-only')
    await notificationService.makeCall(alert, body.recipients)
    return ok({ called: body.recipients.length })
  } catch (e) {
    return handle(e)
  }
}
