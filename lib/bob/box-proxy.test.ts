// The proxy in the box: which requests it sees (the matcher in proxy.ts) and
// what it answers (boxProxy). Review of PR #30, points 1 and 4.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server.js'
import { Attempts } from './login.ts'
import { boxProxy, type BoxProxyDeps } from './box-proxy.ts'
import { ACCESS_COOKIE, resolveSession, type SessionState } from './session.ts'
import { PORTAL_COOKIE } from './portal.ts'

// proxy.ts must export `config` as a literal (Next reads it statically), so
// the test reads the literal rather than importing the file.
const source = readFileSync('proxy.ts', 'utf8')
const literal = source.match(/matcher:\s*\[([\s\S]*?)\]/)![1]
const patterns = [...literal.matchAll(/'([^']+)'/g)].map((m) => m[1].replace(/\\\\/g, '\\'))
const seen = (path: string) => patterns.some((p) => new RegExp(`^${p}$`).test(path))

test('the proxy sees every request but Next\'s static chunks', () => {
  for (const p of ['/', '/bob/quality', '/api/reports/x.json', '/api/alerts/a.js', '/x.css', '/dashboard.html',
    '/coop.html', '/icon/bob-bee.png', '/api/config/thresholds', '/_next/image', '/favicon.ico']) {
    assert.ok(seen(p), p)
  }
  assert.ok(!seen('/_next/static/chunks/main.js'))
})

const USER: SessionState = { kind: 'user', user: { id: 'aaaaaaaa-1111-4000-8000-000000000001', email: 'user@example.com' } } as SessionState
const deps = (o: Partial<BoxProxyDeps> = {}): BoxProxyDeps => ({
  gotrueUrl: () => 'http://gotrue.test',
  portalUrl: () => 'https://portal.test',
  resolveSession: async () => USER,
  role: async () => 'viewer',
  ...o,
})
const req = (path: string) => new NextRequest(`http://box.test${path}`)
const passes = (r: Response) => r.headers.get('x-middleware-next') === '1'

test('a route that is off answers 404, whatever its extension', async () => {
  for (const p of ['/api/reports/x.json', '/api/alerts/a.js', '/x.css', '/coop.html', '/icon/bob-bee.png']) {
    assert.equal((await boxProxy(req(p), deps())).status, 404, p)
  }
})

test('public routes pass without a session', async () => {
  const d = deps({ resolveSession: async () => { throw new Error('must not be called') } })
  assert.ok(passes(await boxProxy(req('/entrar'), d)))
  assert.ok(passes(await boxProxy(req('/api/health'), d)))
})

test('no identity configuration or GoTrue down is a 503; no session is the login', async () => {
  const noConf = deps({ gotrueUrl: () => { throw new Error('unset') } })
  assert.equal((await boxProxy(req('/bob/quality'), noConf)).status, 503)
  const down = deps({ resolveSession: async () => ({ kind: 'unavailable' }) as SessionState })
  assert.equal((await boxProxy(req('/bob/quality'), down)).status, 503)
  assert.equal((await boxProxy(req('/api/bob/quality'), down)).status, 503)
  const none = deps({ resolveSession: async () => ({ kind: 'none' }) as SessionState })
  assert.equal((await boxProxy(req('/api/bob/quality'), none)).status, 401)
  const page = await boxProxy(req('/bob/quality'), none)
  assert.equal(page.status, 307)
  assert.equal(page.headers.get('location'), 'https://portal.test/?volver=https%3A%2F%2Fbox.test%2Fbob%2Fquality')
})

// Henry, 2026-11-26 («se quita el login de bob», «H1: el portal pasa el
// token»): BOb has no login of its own in the box. Without a session, a page
// goes to the BzzzBX portal and comes back; the portal hands the token to
// /entrar. If it comes back without one, BOb does not send it out again.
const noSession = (o: Partial<BoxProxyDeps> = {}) =>
  deps({ resolveSession: async () => ({ kind: 'none' }) as SessionState, ...o })
const withCookie = (path: string, cookie: string) => new NextRequest(`http://box.test${path}`, { headers: { cookie } })

test('without a session a page goes to the portal once, and marks that it went', async () => {
  const r = await boxProxy(req('/bob/performance?range=week'), noSession())
  assert.equal(r.status, 307)
  assert.equal(r.headers.get('location'), 'https://portal.test/?volver=https%3A%2F%2Fbox.test%2Fbob%2Fperformance%3Frange%3Dweek')
  const mark = r.cookies.get(PORTAL_COOKIE)
  assert.ok(mark, 'no mark set')
  assert.equal(mark.httpOnly, true)
  assert.ok((mark.maxAge ?? 0) > 0 && (mark.maxAge ?? 0) <= 120)
})

test('back from the portal still without a session, it is not sent again: a page with a link, no loop', async () => {
  const r = await boxProxy(withCookie('/bob/performance', `${PORTAL_COOKIE}=1`), noSession())
  assert.equal(r.status, 401)
  assert.equal(r.headers.get('location'), null)
  assert.match(r.headers.get('content-type') ?? '', /text\/html/)
  const body = await r.text()
  assert.match(body, /href="https:\/\/portal\.test\/"/)
})

test('/login has no form in the box: it goes to the portal, and comes back to the screens', async () => {
  const r = await boxProxy(req('/login'), noSession({ resolveSession: async () => { throw new Error('must not be called') } }))
  assert.equal(r.status, 307)
  assert.equal(r.headers.get('location'), 'https://portal.test/?volver=https%3A%2F%2Fbox.test%2Fbob%2Fperformance')
  const again = await boxProxy(withCookie('/login', `${PORTAL_COOKIE}=1`), noSession())
  assert.equal(again.status, 401)
})

test('BOb\'s own password login is off in the box', async () => {
  assert.equal((await boxProxy(write('/auth/login', JSON_TYPE), deps())).status, 404)
})

test('the handover page and its POST need no session; the page sends no referrer', async () => {
  const d = noSession({ resolveSession: async () => { throw new Error('must not be called') } })
  const r = await boxProxy(req('/entrar'), d)
  assert.ok(passes(r))
  assert.equal(r.headers.get('referrer-policy'), 'no-referrer')
  assert.ok(passes(await boxProxy(write('/auth/portal', JSON_TYPE), d)))
})

test('without BOB_PORTAL_URL a page without a session is a 503, not a loop to nowhere', async () => {
  const r = await boxProxy(req('/bob/quality'), noSession({ portalUrl: () => { throw new Error('unset') } }))
  assert.equal(r.status, 503)
})

test('Henry, 2026-11-21: an account with no role (inactive, another organization, no seat) is a 403', async () => {
  const noRow = deps({ role: async () => null })
  for (const p of ['/bob/performance', '/bob/quality', '/api/bob/interactions', '/api/config/thresholds',
    '/api/config/responses/x']) {
    assert.equal((await boxProxy(req(p), noRow)).status, 403, p)
  }
  // Signing out, refreshing and asking who one is do not need a role.
  for (const p of ['/auth/me', '/auth/logout', '/auth/refresh']) assert.ok(passes(await boxProxy(req(p), noRow)), p)
})

// Henry, 2026-11-26 («Alta sola, como viewer»): the role lookup may take a
// viewer seat, so it must only ever see the account GoTrue answered for the
// session, and never run without one.
test('the role lookup gets the account GoTrue answered, and nothing else', async () => {
  const seen: unknown[] = []
  const d = deps({ role: async (u) => { seen.push(u); return 'viewer' } })
  const forged = new NextRequest('http://box.test/bob/quality', {
    headers: { 'x-forwarded-user': 'bbbbbbbb-1111-4000-8000-000000000002', 'x-user-email': 'evil@example.com' } })
  assert.ok(passes(await boxProxy(forged, d)))
  assert.deepEqual(seen, [{ id: 'aaaaaaaa-1111-4000-8000-000000000001', email: 'user@example.com' }])
})

test('no session, or GoTrue refusing or down, never reaches the role lookup (no seat)', async () => {
  for (const state of [{ kind: 'none' }, { kind: 'unavailable' }] as SessionState[]) {
    const d = deps({ resolveSession: async () => state, role: async () => { throw new Error('must not be called') } })
    for (const p of ['/bob/quality', '/api/bob/quality', '/api/config/thresholds']) {
      assert.ok(!passes(await boxProxy(req(p), d)), `${p} ${state.kind}`)
    }
  }
})

test('a forged token in the session cookie is refused by GoTrue and takes no seat', async () => {
  const gotrue401 = (async () => new Response('{}', { status: 401 })) as typeof fetch
  const d = deps({
    resolveSession: (jar, base) => resolveSession(jar, base, gotrue401),
    role: async () => { throw new Error('must not be called') },
  })
  const forged = new NextRequest('http://box.test/api/bob/quality', {
    headers: { cookie: `${ACCESS_COOKIE}=eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4In0.forged` } })
  assert.equal((await boxProxy(forged, d)).status, 401)
})

test('an account with a role passes; a failed role lookup is a 503, not a pass', async () => {
  assert.ok(passes(await boxProxy(req('/bob/quality'), deps())))
  const broken = deps({ role: async () => { throw new Error('db down') } })
  const e = console.error; console.error = () => {}
  try {
    assert.equal((await boxProxy(req('/bob/quality'), broken)).status, 503)
  } finally { console.error = e }
})

// ASVS 4.0.3 V4.2.2, V13.1.5, V13.2.3, V13.2.5: SameSite=Lax does not stop a
// cross-site form from signing a browser in, nor a same-site sibling host
// from writing with the session.
const write = (path: string, headers: Record<string, string> = {}, method = 'POST') =>
  new NextRequest(`http://box.test${path}`, { method, headers: { host: 'box.test', ...headers } })
const JSON_TYPE = { 'content-type': 'application/json' }

test('a write from another origin is refused before the session is read', async () => {
  const d = deps({ resolveSession: async () => { throw new Error('must not be called') } })
  for (const h of [
    { 'sec-fetch-site': 'cross-site' },
    { 'sec-fetch-site': 'same-site' },
    { origin: 'https://evil.test' },
    { origin: 'http://box.test:8081' },
    { origin: 'null' },
  ] as Record<string, string>[]) {
    for (const [path, method] of [['/auth/portal', 'POST'], ['/auth/logout', 'POST'], ['/api/config/thresholds/res', 'PUT'],
      ['/api/config/responses/x', 'DELETE']]) {
      const r = await boxProxy(write(path, { ...JSON_TYPE, ...h }, method), d)
      assert.equal(r.status, 403, `${method} ${path} ${JSON.stringify(h)}`)
    }
  }
})

test('a body that is not JSON is refused', async () => {
  for (const h of [
    { 'content-type': 'text/plain' },
    { 'content-type': 'application/x-www-form-urlencoded' },
    { 'content-type': 'application/json-seq' },
    { 'content-length': '12' },
    { 'transfer-encoding': 'chunked' },
  ] as Record<string, string>[]) {
    assert.equal((await boxProxy(write('/auth/portal', h), deps())).status, 415, JSON.stringify(h))
  }
})

test('the box\'s own writes, and clients that are not browsers, pass', async () => {
  for (const h of [
    {},
    { 'sec-fetch-site': 'same-origin', origin: 'http://box.test' },
    // TLS ends at Traefik: the scheme differs, the host does not.
    { origin: 'https://box.test' },
    { 'content-type': 'application/json; charset=utf-8' },
  ] as Record<string, string>[]) {
    const r = await boxProxy(write('/api/config/thresholds/res', { ...JSON_TYPE, ...h }, 'PUT'), deps())
    assert.ok(passes(r), JSON.stringify(h))
  }
  assert.ok(passes(await boxProxy(write('/auth/logout', { 'content-length': '0' }), deps())))
})

test('a read is never refused for where it comes from', async () => {
  assert.ok(passes(await boxProxy(new NextRequest('http://box.test/entrar', { headers: { 'sec-fetch-site': 'cross-site' } }), deps())))
})

test('a refused write is recorded, without its origin header verbatim or the query string', async () => {
  const info = console.info
  const lines: string[] = []
  console.info = (l: string) => { lines.push(l) }
  try {
    await boxProxy(write('/api/config/thresholds/res?token=abc', { ...JSON_TYPE, origin: 'https://evil.test' }, 'PUT'), deps())
    await boxProxy(write('/auth/portal', { 'content-type': 'text/plain' }), deps())
  } finally { console.info = info }
  const events = lines.map((l) => JSON.parse(l))
  assert.deepEqual(events.map((e) => [e.event, e.status, e.method, e.path]), [
    ['access.write_refused', 403, 'PUT', '/api/config/thresholds/res'],
    ['access.write_refused', 415, 'POST', '/auth/portal'],
  ])
  for (const l of lines) assert.doesNotMatch(l, /token=abc/)
})

test('one account cannot flood the API or the screens; another account is not affected', async () => {
  let now = 0
  const clock = () => now
  const d = deps({ apiBudget: new Attempts(3, 60_000, clock), pageBudget: new Attempts(2, 60_000, clock),
    throttleLogged: new Attempts(1, 60_000, clock) })
  const other = deps({ ...d, resolveSession: async () => ({ kind: 'user', user: { id: 'other', email: 'other@example.com' } }) as SessionState })
  const info = console.info
  const lines: string[] = []
  console.info = (l: string) => { lines.push(l) }
  try {
    for (let i = 0; i < 3; i++) assert.ok(passes(await boxProxy(req('/api/bob/interactions'), d)))
    for (let i = 0; i < 5; i++) assert.equal((await boxProxy(req('/api/config/thresholds'), d)).status, 429)
    assert.ok(passes(await boxProxy(req('/api/bob/interactions'), other)))
    // The screens read the same projections: their own budget.
    for (let i = 0; i < 2; i++) assert.ok(passes(await boxProxy(req('/bob/performance'), d)))
    assert.equal((await boxProxy(req('/bob/quality'), d)).status, 429)
    assert.ok(passes(await boxProxy(req('/bob/quality'), other)))
    now += 60_000
    assert.ok(passes(await boxProxy(req('/api/bob/interactions'), d)))
    assert.ok(passes(await boxProxy(req('/bob/performance'), d)))
  } finally { console.info = info }
  const throttled = lines.map((l) => JSON.parse(l)).filter((e) => e.event === 'access.throttled')
  // Five API refusals and one page refusal: said once for each, per account and window.
  assert.deepEqual(throttled.map((e) => e.kind), ['api', 'page'])
})
