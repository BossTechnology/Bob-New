// §5.8 GET /api/channels (any) · POST /api/channels (admin).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, created, badReq, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const sb = await getRouteClient()
    const { data, error } = await sb.from('channels').select('*')
      .eq('org_id', org_id).eq('active', true).order('display_order', { ascending: true })
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin'])
    const body = await request.json().catch(() => null)
    if (!body?.channel_type || !body?.display_name) return badReq('Invalid channel')
    const sb = await getRouteClient()
    const { data, error } = await sb.from('channels').insert({ ...body, org_id }).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
