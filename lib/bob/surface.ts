// What BOb serves in a box (BOB_CAJA=1). An allowlist: anything not named
// here answers 404 in the box, so a route added later is off until someone
// says it reads `bob` as bob_app. docs/bob-schema-data-layer/inventario.md has
// the whole inventory, with the owner of everything that is off.
//
// - public: no session (the way to and from the portal, and the container's
//   healthcheck);
// - session: a live GoTrue session, checked on every request;
// - off: everything else, including what Henry turned off for v1 (/api/ai,
//   Twilio, Resend, the crons) and what has no equivalent in `bob` yet.
export type Access = 'public' | 'session' | 'off'

// /login only sends to the BzzzBX portal; /entrar and /auth/portal take its
// token back (portal.ts). BOb's own password login (/auth/login) is off in the
// box: Henry, 2026-11-26, «se quita el login de bob».
const PUBLIC: string[] = ['/login', '/entrar', '/auth/portal', '/api/health']

// Exact paths, or a prefix ending in '/' that also matches its own path
// without the slash.
const SESSION: string[] = [
  '/',
  // The simulator, painting bob's projections instead of inventing (P-4).
  '/dashboard.html', '/bob-live.mjs',
  '/auth/logout', '/auth/refresh', '/auth/me',
  '/bob/',
  '/api/bob/',
  '/api/config/thresholds/',
  '/api/config/anomalies/',
  '/api/config/textrules/',
  '/api/config/channels/',
  '/api/config/responses/',
]

// The rules themselves, for checks that must cover every one of them.
export const SURFACE = { public: PUBLIC, session: SESSION } as const

// Next's own assets. Other files under public/ reach the proxy and are off,
// but for the simulator and its painter, named in SESSION.
const ASSETS = ['/_next/', '/favicon.ico']

function matches(path: string, rule: string): boolean {
  if (rule === '/') return path === '/'
  if (rule.endsWith('/')) return path === rule.slice(0, -1) || path.startsWith(rule)
  return path === rule
}

export function boxAccess(path: string): Access {
  if (ASSETS.some((a) => matches(path, a))) return 'public'
  if (PUBLIC.some((p) => matches(path, p))) return 'public'
  if (SESSION.some((s) => matches(path, s))) return 'session'
  return 'off'
}
