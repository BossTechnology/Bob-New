// §5.8 GET /api/config (any) · POST /api/config (admin).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, created, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const sb = await getRouteClient()
    const { data, error } = await sb.from('configurations').select('*')
      .eq('org_id', org_id).order('is_default', { ascending: false })
      .order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    return ok(data)
  } catch (e) {
    return handle(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin'])
    const body = await request.json().catch(() => ({}))
    const sb = await getRouteClient()
    const { data, error } = await sb.from('configurations')
      .upsert({ ...body, org_id }, { onConflict: 'id' }).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
