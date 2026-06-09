// §5.6 GET /api/patterns/anomalies — stored anomaly patterns.
import { requireAuth } from '@/lib/auth'
import { patternService } from '@/services'
import { ok, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    return ok(await patternService.list(org_id, 'anomalies'))
  } catch (e) {
    return handle(e)
  }
}
