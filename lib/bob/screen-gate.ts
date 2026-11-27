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
import { boxRole, type Role } from './roles.ts'
import { boxOrgId } from './runtime.ts'
import { audienceFor, type Audience } from './audience.ts'

export function screensEnabled(): boolean {
  if (isBox()) return true
  return process.env.BOB_PERF_MATRIX === '1' && process.env.VERCEL_ENV !== 'production'
}

export type Gate = 'ok' | 'not_found' | 'login' | 'unavailable' | 'forbidden'

export async function screenGate(): Promise<Gate> {
  return (await screenAccess()).gate
}

// The gate and, in the box, the role it was opened with (bob.users, the same
// lookup the gate makes). Outside the box there is no BOb role: null.
async function screenAccess(): Promise<{ gate: Gate; role: Role | null }> {
  const shut = (gate: Gate) => ({ gate, role: null })
  if (!screensEnabled()) return shut('not_found')
  if (isBox()) {
    const s = await boxSession()
    if (s.kind !== 'user') return shut(s.kind === 'none' ? 'login' : 'unavailable')
    try {
      const role = await boxRole(boxOrgId(), s.user.id)
      return role ? { gate: 'ok', role } : shut('forbidden')
    } catch (e) {
      console.error('screen gate: role lookup failed', e instanceof Error ? e.message : e)
      return shut('unavailable')
    }
  }
  // proxy.ts lets every route through while Supabase auth is not configured.
  // These routes do not: without auth they do not exist.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return shut('not_found')
  const supabase = await getRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  return shut(user ? 'ok' : 'login')
}

// For pages. Returns only when the gate is open, with who the screen is
// painted for (audience.ts); 'unavailable' and 'forbidden' are returned so the
// page says so instead of sending to /login.
export async function requireScreen(): Promise<{ audience: Audience } | 'unavailable' | 'forbidden'> {
  const { gate, role } = await screenAccess()
  if (gate === 'not_found') notFound()
  if (gate === 'login') redirect('/login')
  if (gate !== 'ok') return gate
  return { audience: audienceFor(role) }
}
