// §7.1 GET /api/cron/sentiment-aggregation — recompute org sentiment distributions.
import { requireCron } from '@/lib/auth'
import { activeOrgIds } from '@/lib/cron'
import { getServiceClient } from '@/lib/supabase'
import { sentimentService } from '@/services'
import { handle } from '@/lib/api-response'

export async function GET(request: Request) {
  const start = Date.now()
  let processed = 0
  try {
    requireCron(request)
    const sb = getServiceClient()
    const orgs = await activeOrgIds()
    await Promise.allSettled(orgs.map(async (id) => {
      const { data } = await sb.from('channels').select('channel_type').eq('org_id', id).eq('active', true)
      const channels = (data || []).map((c) => c.channel_type as string)
      if (channels.length) await sentimentService.computeDistribution(id, channels)
      processed++
    }))
    return Response.json({ ok: true, processed, duration_ms: Date.now() - start })
  } catch (e) {
    return handle(e)
  }
}
