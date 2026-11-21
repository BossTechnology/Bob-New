// §5.1 GET /auth/me — current user profile, org, role, plan.
import { getRouteClient } from '@/lib/supabase'
import { ok, unauth, handle } from '@/lib/api-response'
import { isBox } from '@/lib/bob/runtime.ts'
import { requireAuth } from '@/lib/auth'

export async function GET() {
  try {
    // In the box: the GoTrue account, the box's org and the role in bob.users.
    if (isBox()) return ok(await requireAuth(['admin', 'analyst', 'viewer']))
    const sb = await getRouteClient()
    const { data: { user } } = await sb.auth.getUser()
    if (!user) return unauth()
    const { data: profile } = await sb.from('users')
      .select('id, email, full_name, role, org_id, organizations(name, slug, plan)')
      .eq('id', user.id).maybeSingle()
    return ok(profile ?? { id: user.id, email: user.email })
  } catch (e) {
    return handle(e)
  }
}
