// Who is asking, in the box: the GoTrue account (checked on this request), the
// box's organisation (configuration, never a token claim) and the account's
// role inside BOb (roles.ts).
import { cookies } from 'next/headers'
import { ApiError } from '../api-response.ts'
import { boxRole } from './roles.ts'
import { logSecurity } from './security-log.ts'
import { boxOrgId, gotrueUrl } from './runtime.ts'
import { resolveSession, type CookieJar, type SessionState } from './session.ts'

// Route handlers can set cookies; server components cannot, and the proxy has
// already refreshed the tokens for them.
export async function requestJar(): Promise<CookieJar> {
  const store = await cookies()
  return {
    get: (n) => store.get(n)?.value || undefined,
    set: (n, v, o) => { try { store.set(n, v, o) } catch { /* server component */ } },
  }
}

export async function boxSession(): Promise<SessionState> {
  return resolveSession(await requestJar(), gotrueUrl())
}

export async function requireBoxAuth(allowedRoles: string[]) {
  const s = await boxSession()
  if (s.kind === 'unavailable') throw new ApiError(503, 'Identity unavailable')
  if (s.kind === 'none') throw new ApiError(401, 'Unauthorized')
  const org_id = boxOrgId()
  // Inactive, another organization's, or no seat taken: 403 (Henry, 2026-11-21;
  // P-1). A first visit took its viewer seat in the proxy (Henry, 2026-11-26).
  const role = await boxRole(org_id, s.user.id)
  if (!role) {
    logSecurity('access.no_role', { user: s.user.id })
    throw new ApiError(403, 'This account has no access to BOb in this box')
  }
  if (!allowedRoles.includes(role)) {
    logSecurity('access.role_refused', { user: s.user.id, role, allowed: allowedRoles.join(',') })
    throw new ApiError(403, `Role ${role} is not permitted for this endpoint`)
  }
  return { user_id: s.user.id, org_id, role }
}
