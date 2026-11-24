// BOb's own session in the box: two httpOnly cookies holding GoTrue's tokens,
// checked against GoTrue on every request (insumos de Bzzz §3.4: getUser, not
// a read of the JWT, because only GoTrue knows the account is still alive).
//
// The organisation never comes from the token: it is the box's (BOB_ORG_ID).
// BOb holds no JWT_SECRET, so it cannot verify a token locally, and it trusts
// no identity header (§4.2, point 9).
import { getUser, refreshGrant, type GoTrueSession, type GoTrueUser } from './gotrue.ts'

export const ACCESS_COOKIE = '__Host-bob-at'
export const REFRESH_COOKIE = '__Host-bob-rt'
const REFRESH_MAX_AGE = 60 * 60 * 24 * 30

export type CookieOptions = { httpOnly: boolean; secure: boolean; sameSite: 'lax'; path: string; maxAge: number }

export interface CookieJar {
  get(name: string): string | undefined
  set(name: string, value: string, options: CookieOptions): void
}

const opts = (maxAge: number): CookieOptions => ({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge })

export function setSessionCookies(jar: CookieJar, s: GoTrueSession) {
  jar.set(ACCESS_COOKIE, s.access_token, opts(s.expires_in))
  jar.set(REFRESH_COOKIE, s.refresh_token, opts(REFRESH_MAX_AGE))
}

// The names before the __Host- prefix. Nothing reads them any more, but a
// browser that signed in before the change may still hold tokens under them.
const LEGACY_COOKIES = ['bob-at', 'bob-rt']

export function clearSessionCookies(jar: CookieJar) {
  jar.set(ACCESS_COOKIE, '', opts(0))
  jar.set(REFRESH_COOKIE, '', opts(0))
  for (const name of LEGACY_COOKIES) jar.set(name, '', opts(0))
}

export type SessionState =
  | { kind: 'user'; user: GoTrueUser }
  | { kind: 'none' }
  | { kind: 'unavailable' }

// One check against GoTrue; one refresh if the access token was refused.
export async function resolveSession(jar: CookieJar, base: string, f: typeof fetch = fetch): Promise<SessionState> {
  const at = jar.get(ACCESS_COOKIE)
  if (at) {
    const r = await getUser(base, at, f)
    if (r.kind !== 'unauthorized') return r.kind === 'user' ? r : { kind: 'unavailable' }
  }
  const rt = jar.get(REFRESH_COOKIE)
  if (!rt) return { kind: 'none' }
  const g = await refreshGrant(base, rt, f)
  if (g.kind === 'unavailable') return { kind: 'unavailable' }
  if (g.kind === 'unauthorized') {
    clearSessionCookies(jar)
    return { kind: 'none' }
  }
  setSessionCookies(jar, g.session)
  const r = await getUser(base, g.session.access_token, f)
  if (r.kind === 'user') return r
  if (r.kind === 'unauthorized') clearSessionCookies(jar)
  return r.kind === 'unauthorized' ? { kind: 'none' } : { kind: 'unavailable' }
}
