// §5.1 POST /auth/logout — invalidate the current session.
import { getRouteClient } from '@/lib/supabase'
import { ok, handle } from '@/lib/api-response'

export async function POST() {
  try {
    const sb = await getRouteClient()
    await sb.auth.signOut()
    return ok({ signed_out: true })
  } catch (e) {
    return handle(e)
  }
}
