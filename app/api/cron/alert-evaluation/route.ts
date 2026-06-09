// §7.1 GET /api/cron/alert-evaluation — evaluate thresholds, fire alerts.
import { requireCron } from '@/lib/auth'
import { activeOrgIds, liveSnapshots } from '@/lib/cron'
import { alertEvalService } from '@/services'
import { handle } from '@/lib/api-response'

export async function GET(request: Request) {
  const start = Date.now()
  let processed = 0
  try {
    requireCron(request)
    const orgs = await activeOrgIds()
    await Promise.allSettled(orgs.map(async (id) => {
      const snaps = await liveSnapshots(id)
      await Promise.allSettled(snaps.map((s) => alertEvalService.evaluate(s)))
      processed++
    }))
    return Response.json({ ok: true, processed, duration_ms: Date.now() - start })
  } catch (e) {
    return handle(e)
  }
}
