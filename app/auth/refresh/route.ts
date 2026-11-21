// §5.1 POST /auth/refresh — refresh the JWT using the refresh token.
import { getRouteClient } from '@/lib/supabase'
import { ok, unauth, handle } from '@/lib/api-response'
import { isBox } from '@/lib/bob/runtime.ts'
import { boxSession } from '@/lib/bob/box-auth.ts'

export async function POST() {
  try {
    // In the box the tokens stay in their httpOnly cookies; this only renews them.
    if (isBox()) {
      const s = await boxSession()
      if (s.kind === 'unavailable') return Response.json({ ok: false, error: 'Identity unavailable' }, { status: 503 })
      return s.kind === 'user' ? ok({ refreshed: true }) : unauth()
    }
    const sb = await getRouteClient()
    const { data, error } = await sb.auth.refreshSession()
    if (error || !data.session) return unauth()
    return ok({ session: data.session })
  } catch (e) {
    return handle(e)
  }
}
