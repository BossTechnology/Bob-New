// §5.7 POST /api/ai/rootcause — RCA over current signals (service role).
import { NextRequest } from 'next/server'
import { requireService } from '@/lib/auth'
import { rootCauseService } from '@/services'
import { ok, badReq, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    requireService(request)
    const body = await request.json().catch(() => null)
    if (!body?.org_id) return badReq('Missing org_id')
    const context = body.context === 'alerts' ? 'alerts' : 'anomalies'
    return ok(await rootCauseService.generate(body.org_id, context))
  } catch (e) {
    return handle(e)
  }
}
