// Who may see the /bob/* screens and /api/bob/*.
//
// In the box they are the product: the proxy has checked the GoTrue session
// and the role, and this checks both again, because a page never relies on
// the matcher alone. No row in bob.users, or inactive, is 'forbidden' (403;
// Henry, 2026-11-21).
// Outside the box they stay what PR #29 made them: off unless BOB_PERF_MATRIX=1,
// never in Vercel production, and only with Supabase auth configured.
import { notFound, redirect } from 'next/navigation'
import { getRouteClient } from '../supabase.ts'
import { isBox } from './runtime.ts'
import { boxSession } from './box-auth.ts'
import { boxRole } from './roles.ts'
import { boxOrgId } from './runtime.ts'

export function screensEnabled(): boolean {
  if (isBox()) return true
  return process.env.BOB_PERF_MATRIX === '1' && process.env.VERCEL_ENV !== 'production'
}

export type Gate = 'ok' | 'not_found' | 'login' | 'unavailable' | 'forbidden'

export async function screenGate(): Promise<Gate> {
  return (await screenAccess()).gate
}

// The gate and, when it is open, the account's role: in the box the row in
// bob.users (roles.ts), outside it the app_role claim with the same default as
// lib/auth.ts. The pages use the role only to choose their words
// (screen-copy.ts); who may enter is decided by the gate alone.
export async function screenAccess(): Promise<{ gate: Gate; role: string | null }> {
  if (!screensEnabled()) return { gate: 'not_found', role: null }
  if (isBox()) {
    const s = await boxSession()
    if (s.kind !== 'user') return { gate: s.kind === 'none' ? 'login' : 'unavailable', role: null }
    try {
      const role = await boxRole(boxOrgId(), s.user.id)
      return role ? { gate: 'ok', role } : { gate: 'forbidden', role: null }
    } catch (e) {
      console.error('screen gate: role lookup failed', e instanceof Error ? e.message : e)
      return { gate: 'unavailable', role: null }
    }
  }
  // proxy.ts lets every route through while Supabase auth is not configured.
  // These routes do not: without auth they do not exist.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return { gate: 'not_found', role: null }
  const supabase = await getRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { gate: 'login', role: null }
  const { data: { session } } = await supabase.auth.getSession()
  return { gate: 'ok', role: (session && claimRole(session.access_token)) || 'viewer' }
}

function claimRole(token: string): string | null {
  try {
    const claims = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))
    return typeof claims?.app_role === 'string' ? claims.app_role : null
  } catch {
    return null
  }
}

// For pages. Returns only when the gate is open, with the role; 'unavailable'
// and 'forbidden' are returned so the page says so instead of sending to /login.
export async function requireScreen(): Promise<{ role: string | null } | 'unavailable' | 'forbidden'> {
  const { gate, role } = await screenAccess()
  if (gate === 'not_found') notFound()
  if (gate === 'login') redirect('/login')
  if (gate === 'unavailable' || gate === 'forbidden') return gate
  return { role }
}
