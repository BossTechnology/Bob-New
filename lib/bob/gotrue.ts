// The box's GoTrue, spoken to directly (insumos de Bzzz §3.4 and §3.5).
//
// Inside the box GoTrue serves at its root (http://bzzz-supabase-auth:9999),
// so supabase-js and @supabase/ssr, which add /auth/v1, cannot be pointed at
// it. These calls are the four BOb needs, with the URL taken at run time.
//
// Every answer is one of three: a user (or a session), "unauthorized", or
// "unavailable". Unavailable is never read as unauthorized: GoTrue down is a
// 503, not a trip to /login (§3.5, a loop against the same dead GoTrue).
export type GoTrueUser = { id: string; email: string | null }
export type GoTrueSession = { access_token: string; refresh_token: string; expires_in: number }

export type UserResult =
  | { kind: 'user'; user: GoTrueUser }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }

export type SessionResult =
  | { kind: 'session'; session: GoTrueSession }
  | { kind: 'unauthorized' }
  | { kind: 'unavailable' }

type Fetch = typeof fetch
const TIMEOUT_MS = 3000

async function call(f: Fetch, url: string, init: RequestInit): Promise<Response | null> {
  try {
    return await f(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS), cache: 'no-store' })
  } catch {
    return null
  }
}

const refused = (r: Response) => r.status === 400 || r.status === 401 || r.status === 403 || r.status === 404 || r.status === 422

export async function getUser(base: string, accessToken: string, f: Fetch = fetch): Promise<UserResult> {
  const r = await call(f, `${base}/user`, { headers: { Authorization: `Bearer ${accessToken}` } })
  if (!r) return { kind: 'unavailable' }
  if (r.ok) {
    const body = await r.json().catch(() => null)
    if (!body || typeof body.id !== 'string') return { kind: 'unavailable' }
    return { kind: 'user', user: { id: body.id, email: typeof body.email === 'string' ? body.email : null } }
  }
  return refused(r) ? { kind: 'unauthorized' } : { kind: 'unavailable' }
}

async function grant(f: Fetch, base: string, type: string, body: unknown): Promise<SessionResult> {
  const r = await call(f, `${base}/token?grant_type=${type}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body),
  })
  if (!r) return { kind: 'unavailable' }
  if (r.ok) {
    const s = await r.json().catch(() => null)
    if (!s?.access_token || !s?.refresh_token) return { kind: 'unavailable' }
    return {
      kind: 'session',
      session: { access_token: s.access_token, refresh_token: s.refresh_token, expires_in: Number(s.expires_in) || 3600 },
    }
  }
  return refused(r) ? { kind: 'unauthorized' } : { kind: 'unavailable' }
}

export const passwordGrant = (base: string, email: string, password: string, f: Fetch = fetch) =>
  grant(f, base, 'password', { email, password })

export const refreshGrant = (base: string, refreshToken: string, f: Fetch = fetch) =>
  grant(f, base, 'refresh_token', { refresh_token: refreshToken })

export async function logout(base: string, accessToken: string, f: Fetch = fetch): Promise<void> {
  await call(f, `${base}/logout`, { method: 'POST', headers: { Authorization: `Bearer ${accessToken}` } })
}

export async function health(base: string, f: Fetch = fetch): Promise<boolean> {
  const r = await call(f, `${base}/health`, {})
  return !!r?.ok
}
