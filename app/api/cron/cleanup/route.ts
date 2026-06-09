// §7.1 GET /api/cron/cleanup — daily retention cleanup.
import { requireCron } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabase'
import { handle } from '@/lib/api-response'

export async function GET(request: Request) {
  const start = Date.now()
  try {
    requireCron(request)
    const sb = getServiceClient()
    const auditCutoff = new Date(Date.now() - 365 * 24 * 3600 * 1000).toISOString()
    const notifCutoff = new Date(Date.now() - 90 * 24 * 3600 * 1000).toISOString()
    await sb.from('audit_log').delete().lt('created_at', auditCutoff)
    await sb.from('notification_log').delete().lt('sent_at', notifCutoff)
    return Response.json({ ok: true, duration_ms: Date.now() - start })
  } catch (e) {
    return handle(e)
  }
}
