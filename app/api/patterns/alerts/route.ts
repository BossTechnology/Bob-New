// §5.6 GET /api/patterns/alerts — stored alert patterns.
import { requireAuth } from '@/lib/auth'
import { patternService } from '@/services'
import { ok, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    return ok(await patternService.list(org_id, 'alerts'))
  } catch (e) {
    return handle(e)
  }
}
