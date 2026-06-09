// §5.6 GET /api/rootcause/alerts — latest RCA for alert cluster (cached 1h).
import { requireAuth } from '@/lib/auth'
import { rootCauseService } from '@/services'
import { ok, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const latest = await rootCauseService.latest(org_id, 'alerts')
    return ok(latest ?? await rootCauseService.generate(org_id, 'alerts'))
  } catch (e) {
    return handle(e)
  }
}
