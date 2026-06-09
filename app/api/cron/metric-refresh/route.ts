// §7.2 GET /api/cron/metric-refresh — refresh metric snapshots for all orgs.
import { requireCron } from '@/lib/auth'
import { activeOrgIds } from '@/lib/cron'
import { metricAggService } from '@/services'
import { handle } from '@/lib/api-response'

export async function GET(request: Request) {
  const start = Date.now()
  let processed = 0
  try {
    requireCron(request)
    const orgs = await activeOrgIds()
    await Promise.allSettled(orgs.map(async (id) => { await metricAggService.refreshAllSnapshots(id); processed++ }))
    return Response.json({ ok: true, processed, duration_ms: Date.now() - start })
  } catch (e) {
    return handle(e)
  }
}
