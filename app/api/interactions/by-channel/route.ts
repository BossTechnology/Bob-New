// §5.3 GET /api/interactions/by-channel — counts grouped by channel_id.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'
import { groupBy } from '@/lib/utils'

export async function GET() {
  try {
    const { org_id } = await requireAuth()
    enforceRateLimit(`interactions:${org_id}`, LIMITS.general)
    const sb = await getRouteClient()
    const { data, error } = await sb.from('interactions').select('channel_id').eq('org_id', org_id).limit(5000)
    if (error) throw error
    const grouped = groupBy(data || [], (r) => (r as { channel_id: string }).channel_id)
    return ok(Object.entries(grouped).map(([channel_id, rows]) => ({ channel_id, count: rows.length })))
  } catch (e) {
    return handle(e)
  }
}
