// §5.2 POST /api/metrics/snapshot — service-role write of a computed snapshot.
import { NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { requireService } from '@/lib/auth'
import { created, badReq, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    requireService(request)
    const body = await request.json().catch(() => null)
    if (!body || !body.org_id || !body.metric) return badReq('Invalid snapshot')
    const sb = getServiceClient()
    const { data, error } = await sb.from('metric_snapshots').insert(body).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
