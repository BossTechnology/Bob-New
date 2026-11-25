// POST /auth/logout in the box. The cookies go whatever GoTrue says; the
// answer says whether GoTrue revoked the session, and the log records it. If
// it did not, the access token stays valid until it expires (at most an
// hour), though this browser no longer holds it.
import { ok } from '../api-response.ts'
import type { LogoutResult } from './gotrue.ts'
import { securityLine } from './security-log.ts'
import { ACCESS_COOKIE, clearSessionCookies, type CookieJar } from './session.ts'

export async function boxLogout(
  jar: CookieJar,
  revoke: (accessToken: string) => Promise<LogoutResult>,
  log: (line: string) => void = console.info,
): Promise<Response> {
  const at = jar.get(ACCESS_COOKIE)
  const result: LogoutResult = at ? await revoke(at) : 'unauthorized'
  clearSessionCookies(jar)
  const revoked = result !== 'unavailable'
  log(securityLine(revoked ? 'logout.ok' : 'logout.not_revoked', { result }))
  const res = ok({ signed_out: true, revoked })
  // What the browser cached of the signed-in pages goes too.
  res.headers.set('Clear-Site-Data', '"cache"')
  return res
}
