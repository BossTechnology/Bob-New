// What BOb serves in a box (BOB_CAJA=1). An allowlist: anything not named
// here answers 404 in the box, so a route added later is off until someone
// says it reads `bob` as bob_app. docs/bob-schema-data-layer/inventario.md has
// the whole inventory, with the owner of everything that is off.
//
// - public: no session (the login itself and the container's healthcheck);
// - session: a live GoTrue session, checked on every request;
// - off: everything else, including what Henry turned off for v1 (/api/ai,
//   Twilio, Resend, the crons) and what has no equivalent in `bob` yet.
export type Access = 'public' | 'session' | 'off'

const PUBLIC: string[] = ['/login', '/auth/login', '/api/health']

// Exact paths, or a prefix ending in '/' that also matches its own path
// without the slash.
const SESSION: string[] = [
  '/',
  '/auth/logout', '/auth/refresh', '/auth/me',
  '/bob/',
  '/api/bob/',
  '/api/config/thresholds/',
  '/api/config/anomalies/',
  '/api/config/textrules/',
  '/api/config/channels/',
  '/api/config/responses/',
]

// Next's own assets. Files under public/ (the simulator, its icons) reach the
// proxy and are off: no box screen uses them.
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
