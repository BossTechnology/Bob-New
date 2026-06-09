// §5.9 POST /api/notify/slack — post alert to Slack webhook (service).
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
    if (!body?.alert_id || !body?.webhook_url) return badReq('Missing alert_id/webhook_url')
    const sb = getServiceClient()
    const { data } = await sb.from('alerts').select('*').eq('id', body.alert_id).single()
    if (!data) return notFound()
    await notificationService.sendSlack(data as BobAlert, body.webhook_url)
    return ok({ posted: true })
  } catch (e) {
    return handle(e)
  }
}
