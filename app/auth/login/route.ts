// §5.1 POST /auth/login — Supabase Auth password sign-in.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, badReq, unauth, handle } from '@/lib/api-response'
import { isBox, gotrueUrl } from '@/lib/bob/runtime.ts'
import { passwordGrant } from '@/lib/bob/gotrue.ts'
import { setSessionCookies } from '@/lib/bob/session.ts'
import { requestJar } from '@/lib/bob/box-auth.ts'
import { LOGIN_ATTEMPTS, boxLogin, clientIp } from '@/lib/bob/login.ts'

export async function POST(request: NextRequest) {
  try {
    // In the box: the box's GoTrue, at run time, throttled per account and
    // per address. The tokens go to httpOnly cookies and never into the body.
    if (isBox()) {
      return await boxLogin(await request.json().catch(() => null), clientIp(request.headers.get('x-forwarded-for')), {
        ...LOGIN_ATTEMPTS,
        grant: (email, password) => passwordGrant(gotrueUrl(), email, password),
        setSession: async (session) => setSessionCookies(await requestJar(), session),
      })
    }

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
