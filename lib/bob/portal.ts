// BOb's login, in the box, is the BzzzBX portal's (Henry, 2026-11-26: «para
// entrar al bob deben tener el login de bzzzbx … se quita el login de bob»,
// and «H1: el portal pasa el token»).
//
// - Without a session, a BOb page sends the person to the portal with
//   ?volver= (portalLoginUrl), and marks that it did (PORTAL_COOKIE, a minute).
// - The portal, with a session of its own, goes to /entrar on BZZZ_HOST_BOB
//   (only that host) with its access token in the URL fragment, never in the
//   query: a fragment does not reach any server or log. /entrar clears it
//   with history.replaceState before anything else, sends no Referer, and
//   posts the token to /auth/portal (handover below).
// - /auth/portal asks GoTrue who the token belongs to (GET /user, as every
//   request does, session.ts) before it becomes BOb's access cookie. A forged
//   or expired token is GoTrue's 401, and no cookie.
// - BOb holds no refresh token: the portal's rotation never collides with a
//   copy here (GoTrue would revoke the whole family on a reuse). When the
//   token expires, BOb sends the person to the portal again; the portal
//   renews its own session and hands back a new token.
// - Back from the portal still without a session (the mark is there), BOb
//   does not send the person out again: a page with a link. No loop.
import { badReq, ok, tooMany, unauth } from '../api-response.ts'
import type { UserResult } from './gotrue.ts'
import { securityLine } from './security-log.ts'
import { ACCESS_COOKIE, clearSessionCookies, type CookieJar, type CookieOptions } from './session.ts'
import { Attempts } from './login.ts'

export { portalUrl } from './runtime.ts'

export const PORTAL_COOKIE = '__Host-bob-portal'
export const PORTAL_MARK_SECONDS = 60
const MAX_TOKEN = 8192
const MAX_SECONDS = 3600
const HOME = '/bob/performance'

const cookie = (maxAge: number): CookieOptions => ({ httpOnly: true, secure: true, sameSite: 'lax', path: '/', maxAge })
export const portalMark = () => cookie(PORTAL_MARK_SECONDS)

export const portalLoginUrl = (portal: string, host: string, pathAndSearch: string) =>
  `${portal}/?volver=${encodeURIComponent(`https://${host}${pathAndSearch}`)}`

export const portalLogoutUrl = (portal: string) => `${portal}/?salir=1`

// One of BOb's own paths, or the screens. Never another origin, never the
// handover itself or /login (each would go straight back to the portal).
export function safeNext(ir: unknown): string {
  if (typeof ir !== 'string' || !/^\/(?![/\\])[\x21-\x7e]*$/.test(ir) || /%0[ad]/i.test(ir)) return HOME
  const path = ir.split(/[?#]/)[0]
  if (path === '/entrar' || path === '/login') return HOME
  return ir
}

// exp from the token's payload, read only after GoTrue answered for it.
function lifetime(token: string, now: number): number {
  try {
    const exp = JSON.parse(Buffer.from(token.split('.')[1] ?? '', 'base64url').toString('utf8'))?.exp
    if (typeof exp !== 'number') return MAX_SECONDS
    return Math.max(1, Math.min(MAX_SECONDS, Math.floor(exp - now / 1000)))
  } catch {
    return MAX_SECONDS
  }
}

export type AdoptDeps = {
  getUser: (accessToken: string) => Promise<UserResult>
  budget: Attempts
  now?: () => number
  log?: (line: string) => void
}

// Per address, like the old login: 10 a minute.
export const ADOPT_ATTEMPTS = new Attempts(10, 60_000)

// POST /auth/portal, body { access_token }.
export async function adoptPortalToken(body: unknown, ip: string, jar: CookieJar, deps: AdoptDeps): Promise<Response> {
  const log = deps.log ?? console.info
  const t = (body as { access_token?: unknown } | null)?.access_token
  if (typeof t !== 'string' || !t || t.length > MAX_TOKEN || !/^[A-Za-z0-9._-]+$/.test(t)) {
    return badReq('Missing access_token')
  }
  if (!deps.budget.take(ip)) {
    log(securityLine('portal.throttled', { ip }))
    return tooMany()
  }
  const r = await deps.getUser(t)
  if (r.kind === 'unavailable') {
    log(securityLine('portal.unavailable', { ip }))
    return Response.json({ ok: false, error: 'Identity unavailable' }, { status: 503 })
  }
  if (r.kind === 'unauthorized') {
    log(securityLine('portal.refused', { ip }))
    return unauth()
  }
  clearSessionCookies(jar)
  jar.set(ACCESS_COOKIE, t, cookie(lifetime(t, (deps.now ?? Date.now)())))
  jar.set(PORTAL_COOKIE, '', cookie(0))
  log(securityLine('portal.ok', { user: r.user.id, ip }))
  return ok({ signed_in: true })
}

export type HandoverDeps = {
  hash: string
  clearHash: () => void
  post: (url: string, init?: RequestInit) => Promise<Response>
  replace: (url: string) => void
  show: (message: string) => void
}

export const HANDOVER_TEXT = {
  missing: 'BOb no recibió la sesión de BzzzBX.',
  refused: 'La sesión de BzzzBX no es válida o caducó.',
  unavailable: 'La identidad de la caja no responde. Vuelve a intentarlo en un momento.',
} as const

// /entrar, in the browser. The fragment goes first, whatever happens next.
// It never sends the person back to the portal by itself: that is the link
// on the page, so a failed handover cannot become a loop.
export async function handover(d: HandoverDeps): Promise<void> {
  const p = new URLSearchParams(d.hash.replace(/^#/, ''))
  d.clearHash()
  const token = p.get('bob_at')
  if (!token) return d.show(HANDOVER_TEXT.missing)
  let status: number
  try {
    const r = await d.post('/auth/portal', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token }),
    })
    status = r.status
  } catch {
    return d.show(HANDOVER_TEXT.unavailable)
  }
  if (status === 200) return d.replace(safeNext(p.get('ir')))
  d.show(status === 503 ? HANDOVER_TEXT.unavailable : HANDOVER_TEXT.refused)
}
