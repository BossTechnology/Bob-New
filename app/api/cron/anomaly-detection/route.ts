// §7.1 GET /api/cron/anomaly-detection — evaluate live snapshots vs baselines.
import { requireCron } from '@/lib/auth'
import { activeOrgIds, liveSnapshots } from '@/lib/cron'
import { anomalyService } from '@/services'
import { handle } from '@/lib/api-response'

export async function GET(request: Request) {
  const start = Date.now()
  let processed = 0
  try {
    requireCron(request)
    const orgs = await activeOrgIds()
    await Promise.allSettled(orgs.map(async (id) => {
      const snaps = await liveSnapshots(id)
      await Promise.allSettled(snaps.map((s) => anomalyService.evaluate(s)))
      processed++
    }))
    return Response.json({ ok: true, processed, duration_ms: Date.now() - start })
  } catch (e) {
    return handle(e)
  }
}
