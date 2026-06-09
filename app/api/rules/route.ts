// §5.8 GET /api/rules (analyst+) · POST /api/rules (admin).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, created, badReq, handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const sb = await getRouteClient()
    const { data, error } = await sb.from('notification_rules').select('*')
      .eq('org_id', org_id).order('created_at', { ascending: false })
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
    if (!body?.metric_id) return badReq('Invalid rule')
    const sb = await getRouteClient()
    const { data, error } = await sb.from('notification_rules').insert({ ...body, org_id }).select().single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
