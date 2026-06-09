// §5.1 POST /auth/signup — creates org + admin user, returns a session.
import { NextRequest } from 'next/server'
import { getRouteClient, getServiceClient } from '@/lib/supabase'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, badReq, handle } from '@/lib/api-response'

function slugify(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || `org-${Date.now()}`
}

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    enforceRateLimit(`auth:${ip}`, LIMITS.auth)
    const body = await request.json().catch(() => null)
    if (!body?.email || !body?.password || !body?.org_name) return badReq('Missing email/password/org_name')

    const svc = getServiceClient()
    // 1) Create the organization.
    const { data: org, error: orgErr } = await svc.from('organizations')
      .insert({ name: body.org_name, slug: slugify(body.org_name) }).select('id').single()
    if (orgErr) throw orgErr

    // 2) Create the auth user with org_id + role in metadata (read by the
    //    handle_new_auth_user trigger and the custom access-token hook).
    const { error: userErr } = await svc.auth.admin.createUser({
      email: body.email, password: body.password, email_confirm: true,
      user_metadata: { org_id: org.id, role: 'admin', full_name: body.full_name || '' },
    })
    if (userErr) throw userErr

    // 3) Establish the session via cookie.
    const sb = await getRouteClient()
    const { data, error } = await sb.auth.signInWithPassword({ email: body.email, password: body.password })
    if (error) throw error
    return ok({ session: data.session, user: data.user, org_id: org.id })
  } catch (e) {
    return handle(e)
  }
}
