// §5.1 POST /auth/refresh — refresh the JWT using the refresh token.
import { getRouteClient } from '@/lib/supabase'
import { ok, unauth, handle } from '@/lib/api-response'

export async function POST() {
  try {
    const sb = await getRouteClient()
    const { data, error } = await sb.auth.refreshSession()
    if (error || !data.session) return unauth()
    return ok({ session: data.session })
  } catch (e) {
    return handle(e)
  }
}
