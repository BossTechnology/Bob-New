// §5.6 POST /api/patterns/compute — on-demand pattern computation (admin → 202).
import { NextRequest } from 'next/server'
import { requireAuth } from '@/lib/auth'
import { patternService } from '@/services'
import { accepted, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin'])
    const body = await request.json().catch(() => ({}))
    const context = body?.context === 'alerts' ? 'alerts' : 'anomalies'
    // Fire-and-forget; the cron also runs this every 15 min (§7.1).
    void patternService.compute(org_id, context)
    return accepted({ context, status: 'computing' })
  } catch (e) {
    return handle(e)
  }
}
