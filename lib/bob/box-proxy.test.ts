// The proxy in the box: which requests it sees (the matcher in proxy.ts) and
// what it answers (boxProxy). Review of PR #30, points 1 and 4.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server.js'
import { boxProxy, type BoxProxyDeps } from './box-proxy.ts'
import type { SessionState } from './session.ts'

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
  assert.ok(passes(await boxProxy(req('/login'), d)))
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
  assert.match(page.headers.get('location') ?? '', /\/login$/)
})

test('Henry, 2026-11-21: an account with no row in bob.users, or inactive, is a 403', async () => {
  const noRow = deps({ role: async () => null })
  for (const p of ['/bob/performance', '/bob/quality', '/api/bob/interactions', '/api/config/thresholds',
    '/api/config/responses/x']) {
    assert.equal((await boxProxy(req(p), noRow)).status, 403, p)
  }
  // Signing out, refreshing and asking who one is do not need a role.
  for (const p of ['/auth/me', '/auth/logout', '/auth/refresh']) assert.ok(passes(await boxProxy(req(p), noRow)), p)
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
    for (const [path, method] of [['/auth/login', 'POST'], ['/auth/logout', 'POST'], ['/api/config/thresholds/res', 'PUT'],
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
    assert.equal((await boxProxy(write('/auth/login', h), deps())).status, 415, JSON.stringify(h))
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
  assert.ok(passes(await boxProxy(new NextRequest('http://box.test/login', { headers: { 'sec-fetch-site': 'cross-site' } }), deps())))
})
