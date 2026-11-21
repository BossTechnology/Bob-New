// Who may see the /bob/* screens and /api/bob/*.
//
// In the box they are the product: the proxy has checked the GoTrue session,
// and this checks it again, because a page never relies on the matcher alone.
// Outside the box they stay what PR #29 made them: off unless BOB_PERF_MATRIX=1,
// never in Vercel production, and only with Supabase auth configured.
import { notFound, redirect } from 'next/navigation'
import { getRouteClient } from '../supabase.ts'
import { isBox } from './runtime.ts'
import { boxSession } from './box-auth.ts'

export function screensEnabled(): boolean {
  if (isBox()) return true
  return process.env.BOB_PERF_MATRIX === '1' && process.env.VERCEL_ENV !== 'production'
}

export type Gate = 'ok' | 'not_found' | 'login' | 'unavailable'

export async function screenGate(): Promise<Gate> {
  if (!screensEnabled()) return 'not_found'
  if (isBox()) {
    const s = await boxSession()
    return s.kind === 'user' ? 'ok' : s.kind === 'none' ? 'login' : 'unavailable'
  }
  // proxy.ts lets every route through while Supabase auth is not configured.
  // These routes do not: without auth they do not exist.
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return 'not_found'
  const supabase = await getRouteClient()
  const { data: { user } } = await supabase.auth.getUser()
  return user ? 'ok' : 'login'
}

// For pages. Returns only when the gate is open; 'unavailable' is returned so
// the page can say the box's identity is down instead of sending to /login.
export async function requireScreen(): Promise<'ok' | 'unavailable'> {
  const g = await screenGate()
  if (g === 'not_found') notFound()
  if (g === 'login') redirect('/login')
  return g
}
