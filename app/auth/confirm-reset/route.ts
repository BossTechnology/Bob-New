// §5.1 POST /auth/confirm-reset — set a new password using the recovery session.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { ok, badReq, unauth, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => null)
    if (!body?.new_password) return badReq('Missing new_password')
    const sb = await getRouteClient()
    // The recovery link establishes a session cookie; update the password on it.
    const { data: { session } } = await sb.auth.getSession()
    if (!session) return unauth()
    const { error } = await sb.auth.updateUser({ password: body.new_password })
    if (error) throw error
    return ok({ updated: true })
  } catch (e) {
    return handle(e)
  }
}
