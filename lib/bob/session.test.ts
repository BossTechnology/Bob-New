// The box session against a fake GoTrue. No network.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { getUser, logout, passwordGrant } from './gotrue.ts'
import { ACCESS_COOKIE, REFRESH_COOKIE, clearSessionCookies, resolveSession, setSessionCookies, type CookieJar } from './session.ts'

const BASE = 'http://bzzz-supabase-auth:9999'
const USER = { id: 'aaaaaaaa-1111-4000-8000-000000000001', email: 'user@example.com' }

type Route = (url: string, init: RequestInit) => Response | 'down'
function fakeFetch(route: Route) {
  const calls: string[] = []
  const f = (async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = String(input)
    calls.push(`${init.method ?? 'GET'} ${url.replace(BASE, '')}`)
    const r = route(url, init)
    if (r === 'down') throw new TypeError('fetch failed')
    return r
  }) as typeof fetch
  return { f, calls }
}
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status })

function jar(initial: Record<string, string> = {}) {
  const store = new Map(Object.entries(initial))
  const j: CookieJar & { store: Map<string, string> } = {
    store,
    get: (n) => store.get(n) || undefined,
    set: (n, v) => { store.set(n, v) },
  }
  return j
}

test('GoTrue is called at its root, with no /auth/v1', async () => {
  const { f, calls } = fakeFetch(() => json(200, USER))
  await getUser(BASE, 'at', f)
  assert.deepEqual(calls, ['GET /user'])
})

test('a live access token gives the user', async () => {
  const { f } = fakeFetch(() => json(200, USER))
  const s = await resolveSession(jar({ [ACCESS_COOKIE]: 'at' }), BASE, f)
  assert.deepEqual(s, { kind: 'user', user: USER })
})

test('no cookie is no session, and GoTrue is not asked', async () => {
  const { f, calls } = fakeFetch(() => json(200, USER))
  assert.deepEqual(await resolveSession(jar(), BASE, f), { kind: 'none' })
  assert.deepEqual(calls, [])
})

test('GoTrue down is unavailable, never no session', async () => {
  const { f } = fakeFetch(() => 'down')
  assert.deepEqual(await resolveSession(jar({ [ACCESS_COOKIE]: 'at', [REFRESH_COOKIE]: 'rt' }), BASE, f),
    { kind: 'unavailable' })
  const { f: f500 } = fakeFetch(() => json(500, {}))
  assert.deepEqual(await resolveSession(jar({ [ACCESS_COOKIE]: 'at' }), BASE, f500), { kind: 'unavailable' })
})

test('a refused access token is refreshed once, and the new tokens are set', async () => {
  const { f, calls } = fakeFetch((url, init) => {
    if (url.endsWith('/user')) {
      const auth = new Headers(init.headers).get('Authorization')
      return auth === 'Bearer at2' ? json(200, USER) : json(401, {})
    }
    return json(200, { access_token: 'at2', refresh_token: 'rt2', expires_in: 3600 })
  })
  const j = jar({ [ACCESS_COOKIE]: 'old', [REFRESH_COOKIE]: 'rt' })
  assert.deepEqual(await resolveSession(j, BASE, f), { kind: 'user', user: USER })
  assert.equal(j.store.get(ACCESS_COOKIE), 'at2')
  assert.equal(j.store.get(REFRESH_COOKIE), 'rt2')
  assert.deepEqual(calls, ['GET /user', 'POST /token?grant_type=refresh_token', 'GET /user'])
})

test('a refused refresh clears the cookies and is no session', async () => {
  const { f } = fakeFetch(() => json(400, { error: 'invalid_grant' }))
  const j = jar({ [ACCESS_COOKIE]: 'old', [REFRESH_COOKIE]: 'rt' })
  assert.deepEqual(await resolveSession(j, BASE, f), { kind: 'none' })
  assert.equal(j.get(ACCESS_COOKIE), undefined)
  assert.equal(j.get(REFRESH_COOKIE), undefined)
})

test('a wrong password is unauthorized; GoTrue down is unavailable', async () => {
  assert.equal((await passwordGrant(BASE, 'u', 'p', fakeFetch(() => json(400, {})).f)).kind, 'unauthorized')
  assert.equal((await passwordGrant(BASE, 'u', 'p', fakeFetch(() => 'down').f)).kind, 'unavailable')
  assert.equal((await passwordGrant(BASE, 'u', 'p', fakeFetch(() => json(503, {})).f)).kind, 'unavailable')
})

// ASVS 4.0.3 V3.4.1-V3.4.5: __Host- needs Secure, Path=/ and no Domain, and
// the browser then refuses a cookie of that name set by another host.
test('both session cookies carry the __Host- prefix and what it requires', () => {
  const set: [string, Record<string, unknown>][] = []
  // The cookies that carry the session; the old names are only expired.
  setSessionCookies({ get: () => undefined, set: (n, v, o) => { if (v) set.push([n, o]) } },
    { access_token: 'a', refresh_token: 'r', expires_in: 3600 })
  assert.equal(set.length, 2)
  for (const [name, o] of set) {
    assert.match(name, /^__Host-/)
    assert.deepEqual([o.secure, o.httpOnly, o.path, o.sameSite, 'domain' in o], [true, true, '/', 'lax', false])
  }
})

test('signing out also clears the cookies from before the __Host- prefix', () => {
  const j = jar({ [ACCESS_COOKIE]: 'at', [REFRESH_COOKIE]: 'rt', 'bob-at': 'old-at', 'bob-rt': 'old-rt' })
  clearSessionCookies(j)
  for (const n of [ACCESS_COOKIE, REFRESH_COOKIE, 'bob-at', 'bob-rt']) assert.equal(j.store.get(n), '', n)
})

test('signing in also clears the cookies from before the __Host- prefix', () => {
  const j = jar({ 'bob-at': 'old-at', 'bob-rt': 'old-rt' })
  setSessionCookies(j, { access_token: 'at', refresh_token: 'rt', expires_in: 3600 })
  assert.equal(j.store.get('bob-at'), '')
  assert.equal(j.store.get('bob-rt'), '')
  assert.equal(j.store.get(ACCESS_COOKIE), 'at')
})

test('logout ends this session only, and says whether GoTrue revoked it', async () => {
  const ok = fakeFetch(() => new Response(null, { status: 204 }))
  assert.equal(await logout(BASE, 'at', ok.f), 'revoked')
  assert.deepEqual(ok.calls, ['POST /logout?scope=local'])
  assert.equal(await logout(BASE, 'at', fakeFetch(() => json(401, {})).f), 'unauthorized')
  assert.equal(await logout(BASE, 'at', fakeFetch(() => json(500, {})).f), 'unavailable')
  assert.equal(await logout(BASE, 'at', fakeFetch(() => 'down').f), 'unavailable')
})
