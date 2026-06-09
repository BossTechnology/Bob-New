// §5.1 POST /auth/reset-password — trigger reset email (via Supabase/Resend).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, badReq, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const ip = request.headers.get('x-forwarded-for') || 'unknown'
    enforceRateLimit(`auth:${ip}`, LIMITS.auth)
    const body = await request.json().catch(() => null)
    if (!body?.email) return badReq('Missing email')
    const sb = await getRouteClient()
    const redirectTo = `${process.env.NEXT_PUBLIC_APP_URL || ''}/login`
    await sb.auth.resetPasswordForEmail(body.email, { redirectTo })
    return ok({ sent: true })
  } catch (e) {
    return handle(e)
  }
}
