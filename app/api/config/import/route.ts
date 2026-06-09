// §5.8 POST /api/config/import — restore a config snapshot (admin).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { created, badReq, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin'])
    const body = await request.json().catch(() => null)
    if (!body || typeof body !== 'object') return badReq('Invalid config JSON')
    // Strip identity fields so the snapshot lands in the caller's org.
    const rest = { ...body }
    delete rest.id; delete rest.org_id; delete rest.created_at; delete rest.updated_at
    const sb = await getRouteClient()
    const { data, error } = await sb.from('configurations')
      .insert({ ...rest, org_id }).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
