// §5.7 GET /api/ai/conversations — BObee history for the current user.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    const { user_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const sp = request.nextUrl.searchParams
    const limit = Math.min(Number(sp.get('limit') || '20'), 100)

    const sb = await getRouteClient()
    let q = sb.from('bobee_conversations').select('*').eq('user_id', user_id)
      .order('updated_at', { ascending: false }).limit(limit)
    if (sp.get('session_id')) q = q.eq('session_id', sp.get('session_id')!)
    const { data, error } = await q
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}
