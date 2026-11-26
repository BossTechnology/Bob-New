// §5.1 POST /auth/logout — invalidate the current session.
import { getRouteClient } from '@/lib/supabase'
import { ok, handle } from '@/lib/api-response'
import { isBox, gotrueUrl, portalUrl } from '@/lib/bob/runtime.ts'
import { portalLogoutUrl } from '@/lib/bob/portal.ts'
import { logout } from '@/lib/bob/gotrue.ts'
import { boxLogout } from '@/lib/bob/logout.ts'
import { requestJar } from '@/lib/bob/box-auth.ts'

export async function POST() {
  try {
    if (isBox()) return await boxLogout(await requestJar(), (at) => logout(gotrueUrl(), at), console.info, portalLogoutUrl(portalUrl()))
    const sb = await getRouteClient()
    await sb.auth.signOut()
    return ok({ signed_out: true })
  } catch (e) {
    return handle(e)
  }
}
