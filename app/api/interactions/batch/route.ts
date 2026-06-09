// §5.3 POST /api/interactions/batch — batch ingest up to 100 events (service).
// This is the Layer-1 ingestion entry point (§8.6) for the observability adapter.
import { NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { requireService } from '@/lib/auth'
import { created, badReq, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    requireService(request)
    const body = await request.json().catch(() => null)
    if (!Array.isArray(body) || body.length === 0) return badReq('Expected non-empty array')
    if (body.length > 100) return badReq('Max 100 events per batch')
    const sb = getServiceClient()
    const { data, error } = await sb.from('interactions').insert(body).select('id')
    if (error) throw error
    return created({ inserted: data?.length ?? 0 })
  } catch (e) {
    return handle(e)
  }
}
