// §5.1 POST /auth/logout — invalidate the current session.
import { getRouteClient } from '@/lib/supabase'
import { ok, handle } from '@/lib/api-response'
import { isBox, gotrueUrl } from '@/lib/bob/runtime.ts'
import { logout } from '@/lib/bob/gotrue.ts'
import { ACCESS_COOKIE, clearSessionCookies } from '@/lib/bob/session.ts'
import { requestJar } from '@/lib/bob/box-auth.ts'

export async function POST() {
  try {
    if (isBox()) {
      const jar = await requestJar()
      const at = jar.get(ACCESS_COOKIE)
      if (at) await logout(gotrueUrl(), at)
      clearSessionCookies(jar)
      return ok({ signed_out: true })
    }
    const sb = await getRouteClient()
    await sb.auth.signOut()
    return ok({ signed_out: true })
  } catch (e) {
    return handle(e)
  }
}
