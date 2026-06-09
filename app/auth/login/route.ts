// §5.1 POST /auth/login — Supabase Auth password sign-in.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, badReq, unauth, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    enforceRateLimit(`auth:${ip}`, LIMITS.auth)
    const body = await request.json().catch(() => null)
    if (!body?.email || !body?.password) return badReq('Missing email/password')

    const sb = await getRouteClient()
    const { data, error } = await sb.auth.signInWithPassword({ email: body.email, password: body.password })
    if (error || !data.session) return unauth()
    return ok({ session: data.session, user: data.user })
  } catch (e) {
    return handle(e)
  }
}
