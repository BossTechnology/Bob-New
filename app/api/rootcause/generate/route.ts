// §5.6 POST /api/rootcause/generate — rule-based → Claude fallback (admin).
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { rootCauseService } from '@/services'
import { ok, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin'])
    const body = await request.json().catch(() => ({}))
    const context = body?.context === 'alerts' ? 'alerts' : 'anomalies'
    return ok(await rootCauseService.generate(org_id, context))
  } catch (e) {
    return handle(e)
  }
}
