// The proxy in the box (BOB_CAJA=1), insumos de Bzzz §3.5: an allowlist of
// routes (surface.ts), the session checked against the box's GoTrue on every
// request, the account's role in bob.users, and failing closed.
//
// - off route: 404 (any extension: the matcher sees every path but
//   _next/static, review of PR #30 point 4);
// - no identity configuration, GoTrue down or the role lookup failing: 503
//   (not /login: that would loop against the same dead GoTrue);
// - no session (Henry, 2026-11-26, «se quita el login de bob»): pages go to
//   the BzzzBX portal once and come back through /entrar (portal.ts); back
//   without a session, a page with a link and no second trip; /login goes to
//   the portal too. The API answers 401;
// - no row in bob.users: a viewer seat on the first visit (Henry,
//   2026-11-26, «Alta sola, como viewer»); an inactive row: 403 on /bob/*,
//   /api/bob/* and /api/config/* (Henry, 2026-11-21);
// - a write from another origin: 403; with a body that is not JSON: 415
//   (request-guard.ts).
import { NextResponse, type NextRequest } from 'next/server.js'
import { boxAccess } from './surface.ts'
import { refuseWrite } from './request-guard.ts'
import { boxOrgId, gotrueUrl, portalUrl } from './runtime.ts'
import { PORTAL_COOKIE, portalLoginUrl, portalMark } from './portal.ts'
import { resolveSession, type CookieJar, type CookieOptions, type SessionState } from './session.ts'
import { logSecurity } from './security-log.ts'
import { Attempts } from './login.ts'
import { boxRoleOrSeat, type Role } from './roles.ts'
import type { GoTrueUser } from './gotrue.ts'
import { withSecurityHeaders } from './security-headers.ts'

export type BoxProxyDeps = {
  gotrueUrl: () => string
  portalUrl: () => string
  resolveSession: (jar: CookieJar, base: string) => Promise<SessionState>
  // Takes a viewer seat on a first visit (roles.ts): only ever the account
  // GoTrue answered for this request.
  role: (user: GoTrueUser) => Promise<Role | null>
  apiBudget?: Attempts
  pageBudget?: Attempts
  throttleLogged?: Attempts
}

// Per account, on the routes that reach the database (ASVS 4.0.3 V11.1.4).
// The live dashboard asks for three figures a minute; an editor saving rules
// adds a few writes. 120 a minute leaves room for both. The /bob screens read
// the same projections, one page at a time: 60 a minute. A refusal is logged
// once per account and minute, not on every request.
export const API_BUDGET = new Attempts(120, 60_000)
export const PAGE_BUDGET = new Attempts(60, 60_000)
const THROTTLE_LOGGED = new Attempts(1, 60_000)

const DEFAULT_DEPS: BoxProxyDeps = {
  gotrueUrl,
  portalUrl: () => portalUrl(),
  resolveSession,
  role: (user) => boxRoleOrSeat(boxOrgId(), user),
  apiBudget: API_BUDGET,
  pageBudget: PAGE_BUDGET,
  throttleLogged: THROTTLE_LOGGED,
}

// The routes that read or write bob for the account need a role; signing in
// and out, refreshing and /auth/me do not.
const NEEDS_ROLE = ['/bob/', '/api/bob/', '/api/config/']
export const needsRole = (path: string) =>
  NEEDS_ROLE.some((p) => path === p.slice(0, -1) || path.startsWith(p))

const plain = (status: number, body: string) =>
  new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

// Where the person goes without a session: the portal, once. The mark says a
// trip is under way; back with it and still no session, the trip failed, and
// another one would only repeat it.
function toPortal(request: NextRequest, deps: BoxProxyDeps, back: string): NextResponse {
  let portal: string
  try {
    portal = deps.portalUrl()
  } catch {
    return plain(503, 'BOb no tiene configurado el portal de la caja.')
  }
  if (request.cookies.get(PORTAL_COOKIE)?.value) {
    logSecurity('portal.no_session_back', { path: request.nextUrl.pathname })
    return new NextResponse(
      '<!doctype html><meta charset="utf-8"><title>BOb</title>'
      + '<p>BOb no recibió la sesión de BzzzBX.</p>'
      + `<p><a href="${portal}/">Entrar por el portal de BzzzBX</a></p>`,
      { status: 401, headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' } })
  }
  // The same host the write guard checks: Host, as Traefik keeps it.
  const host = request.headers.get('host') ?? request.nextUrl.host
  const r = NextResponse.redirect(portalLoginUrl(portal, host, back))
  r.cookies.set(PORTAL_COOKIE, '1', portalMark())
  return r
}

async function roleResponse(request: NextRequest, deps: BoxProxyDeps, user: GoTrueUser, isApi: boolean) {
  const userId = user.id
  let role: Role | null
  try {
    role = await deps.role(user)
  } catch (e) {
    console.error('box proxy: role lookup failed', e instanceof Error ? e.message : e)
    return isApi
      ? NextResponse.json({ ok: false, error: 'Database unavailable' }, { status: 503 })
      : plain(503, 'BOb no puede leer su base. Vuelve a intentarlo en un momento.')
  }
  if (role) return NextResponse.next({ request })
  logSecurity('access.no_role', { user: userId, method: request.method, path: request.nextUrl.pathname })
  return isApi
    ? NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    : plain(403, 'Esta cuenta no tiene acceso a BOb en esta caja.')
}

function overBudget(deps: BoxProxyDeps, userId: string, isApi: boolean): boolean {
  const budget = isApi ? deps.apiBudget : deps.pageBudget
  return budget ? !budget.take(userId) : false
}

// Every answer, whatever its status, leaves with the security headers.
export async function boxProxy(request: NextRequest, deps: BoxProxyDeps = DEFAULT_DEPS): Promise<NextResponse> {
  return withSecurityHeaders(await decide(request, deps), request.nextUrl.pathname)
}

async function decide(request: NextRequest, deps: BoxProxyDeps): Promise<NextResponse> {
  const path = request.nextUrl.pathname
  // The portal's token is in /entrar's fragment, and a browser carries the
  // fragment over any 3xx it follows: /entrar is answered before anything
  // that could send it elsewhere (session, identity, role, the portal).
  if (path === '/entrar' && (request.method === 'GET' || request.method === 'HEAD')) return NextResponse.next({ request })
  const access = boxAccess(path)
  if (access === 'off') return plain(404, 'Not found')
  const refused = refuseWrite(request.method, request.headers, request.headers.get('host') ?? request.nextUrl.host)
  if (refused) {
    logSecurity('access.write_refused', { status: refused.status, method: request.method, path })
    return NextResponse.json({ ok: false, error: refused.error }, { status: refused.status })
  }
  if (path === '/login') return toPortal(request, deps, '/bob/performance')
  if (access === 'public') return NextResponse.next({ request })

  let base: string
  try {
    base = deps.gotrueUrl()
  } catch {
    return plain(503, 'BOb no tiene configurada la identidad de la caja.')
  }

  const pending: [string, string, CookieOptions][] = []
  const jar: CookieJar = {
    get: (n) => request.cookies.get(n)?.value || undefined,
    set: (n, v, o) => { pending.push([n, v, o]); request.cookies.set(n, v) },
  }
  const s = await deps.resolveSession(jar, base)
  const isApi = path.startsWith('/api/') || path.startsWith('/auth/')
  let response: NextResponse
  if (s.kind === 'unavailable') {
    response = isApi
      ? NextResponse.json({ ok: false, error: 'identity unavailable' }, { status: 503 })
      : plain(503, 'La identidad de la caja no responde. BOb no sirve nada hasta que vuelva.')
  } else if (s.kind === 'none') {
    response = isApi
      ? NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      : toPortal(request, deps, request.nextUrl.pathname + request.nextUrl.search)
  } else if (needsRole(path) && overBudget(deps, s.user.id, isApi)) {
    const kind = isApi ? 'api' : 'page'
    if (deps.throttleLogged?.take(`${s.user.id}|${kind}`) ?? true) {
      logSecurity('access.throttled', { user: s.user.id, kind, method: request.method, path })
    }
    response = isApi
      ? NextResponse.json({ ok: false, error: 'Rate limit exceeded' }, { status: 429 })
      : plain(429, 'Demasiadas solicitudes. Espera un momento y vuelve a cargar.')
  } else if (needsRole(path)) {
    response = await roleResponse(request, deps, s.user, isApi)
  } else {
    response = NextResponse.next({ request })
  }
  for (const [n, v, o] of pending) response.cookies.set(n, v, o)
  return response
}
