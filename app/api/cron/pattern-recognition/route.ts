// §7.1 GET /api/cron/pattern-recognition — detect patterns every 15 min.
import { requireCron } from '@/lib/auth'
import { activeOrgIds } from '@/lib/cron'
import { patternService } from '@/services'
import { handle } from '@/lib/api-response'

export async function GET(request: Request) {
  const start = Date.now()
  let processed = 0
  try {
    requireCron(request)
    const orgs = await activeOrgIds()
    await Promise.allSettled(orgs.map(async (id) => {
      await patternService.compute(id, 'anomalies')
      await patternService.compute(id, 'alerts')
      processed++
    }))
    return Response.json({ ok: true, processed, duration_ms: Date.now() - start })
  } catch (e) {
    return handle(e)
  }
}
