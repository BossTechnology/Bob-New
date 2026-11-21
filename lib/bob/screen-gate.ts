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
  if (!screensEnabled()) return 'not_found'
  if (isBox()) {
    const s = await boxSession()
    if (s.kind !== 'user') return s.kind === 'none' ? 'login' : 'unavailable'
    try {
      return (await boxRole(boxOrgId(), s.user.id)) ? 'ok' : 'forbidden'
    } catch (e) {
      console.error('screen gate: role lookup failed', e instanceof Error ? e.message : e)
      return 'unavailable'
    }
  }
  // proxy.ts lets every route through while Supabase auth is not configured.
  // These routes do not: without auth they do not exist.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return 'not_found'
  const supabase = await getRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? 'ok' : 'login'
}

// For pages. Returns only when the gate is open; 'unavailable' and
// 'forbidden' are returned so the page says so instead of sending to /login.
export async function requireScreen(): Promise<'ok' | 'unavailable' | 'forbidden'> {
  const g = await screenGate()
  if (g === 'not_found') notFound()
  if (g === 'login') redirect('/login')
  return g
}
