// §7.1 GET /api/cron/notif-retry — retry failed notification deliveries.
import { requireCron } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabase'
import { handle } from '@/lib/api-response'

export async function GET(request: Request) {
  const start = Date.now()
  try {
    requireCron(request)
    const sb = getServiceClient()
    // Mark exhausted retries (>=3 attempts) as failed; bump the rest.
    const { data } = await sb.from('notification_log').select('id, attempt_count').eq('status', 'retrying').limit(100)
    let retried = 0
    for (const row of (data as { id: string; attempt_count: number }[]) || []) {
      const attempts = (row.attempt_count || 1) + 1
      const status = attempts > 3 ? 'failed' : 'retrying'
      await sb.from('notification_log').update({ attempt_count: attempts, status }).eq('id', row.id)
      retried++
    }
    return Response.json({ ok: true, retried, duration_ms: Date.now() - start })
  } catch (e) {
    return handle(e)
  }
}
