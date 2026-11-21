// The proxy in the box (BOB_CAJA=1), insumos de Bzzz §3.5: an allowlist of
// routes (surface.ts), the session checked against the box's GoTrue on every
// request, the account's role in bob.users, and failing closed.
//
// - off route: 404 (any extension: the matcher sees every path but
//   _next/static, review of PR #30 point 4);
// - no identity configuration, GoTrue down or the role lookup failing: 503
//   (not /login: that would loop against the same dead GoTrue);
// - GoTrue's 401: /login for pages, 401 for the API;
// - no row in bob.users, or inactive: 403 on /bob/*, /api/bob/* and
//   /api/config/* (Henry, 2026-11-21).
import { NextResponse, type NextRequest } from 'next/server.js'
import { boxAccess } from './surface.ts'
import { boxOrgId, gotrueUrl } from './runtime.ts'
import { resolveSession, type CookieJar, type CookieOptions, type SessionState } from './session.ts'
import { boxRole, type Role } from './roles.ts'

export type BoxProxyDeps = {
  gotrueUrl: () => string
  resolveSession: (jar: CookieJar, base: string) => Promise<SessionState>
  role: (userId: string) => Promise<Role | null>
}

const DEFAULT_DEPS: BoxProxyDeps = {
  gotrueUrl,
  resolveSession,
  role: (userId) => boxRole(boxOrgId(), userId),
}

// The routes that read or write bob for the account need a role; signing in
// and out, refreshing and /auth/me do not.
const NEEDS_ROLE = ['/bob/', '/api/bob/', '/api/config/']
export const needsRole = (path: string) =>
  NEEDS_ROLE.some((p) => path === p.slice(0, -1) || path.startsWith(p))

const plain = (status: number, body: string) =>
  new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

async function roleResponse(request: NextRequest, deps: BoxProxyDeps, userId: string, isApi: boolean) {
  let role: Role | null
  try {
    role = await deps.role(userId)
  } catch (e) {
    console.error('box proxy: role lookup failed', e instanceof Error ? e.message : e)
    return isApi
      ? NextResponse.json({ ok: false, error: 'Database unavailable' }, { status: 503 })
      : plain(503, 'BOb no puede leer su base. Vuelve a intentarlo en un momento.')
  }
  if (role) return NextResponse.next({ request })
  return isApi
    ? NextResponse.json({ ok: false, error: 'Forbidden' }, { status: 403 })
    : plain(403, 'Esta cuenta no tiene acceso a BOb en esta caja.')
}

export async function boxProxy(request: NextRequest, deps: BoxProxyDeps = DEFAULT_DEPS): Promise<NextResponse> {
  const path = request.nextUrl.pathname
  const access = boxAccess(path)
  if (access === 'off') return plain(404, 'Not found')
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
      : NextResponse.redirect(new URL('/login', request.url))
  } else if (needsRole(path)) {
    response = await roleResponse(request, deps, s.user.id, isApi)
  } else {
    response = NextResponse.next({ request })
  }
  for (const [n, v, o] of pending) response.cookies.set(n, v, o)
  return response
}
