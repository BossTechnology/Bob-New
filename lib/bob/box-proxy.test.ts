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

// ASVS 4.0.3 V14.4.3-V14.4.7 (docs/asvs-l2-box.md): every answer of the box
// carries the browser-side headers, whatever its status. HSTS is the box's
// (Traefik terminates TLS), not the app's.
test('every answer in the box carries the security headers', async () => {
  const none = deps({ resolveSession: async () => ({ kind: 'none' }) as SessionState })
  const answers = [
    await boxProxy(req('/coop.html'), deps()), // off: 404
    await boxProxy(req('/login'), deps()), // public
    await boxProxy(req('/bob/quality'), none), // redirect to /login
    await boxProxy(req('/api/bob/quality'), none), // 401
    await boxProxy(req('/api/bob/quality'), deps({ role: async () => null })), // 403
    await boxProxy(req('/bob/quality'), deps()), // passes
  ]
  for (const r of answers) {
    const at = `status ${r.status}`
    assert.equal(r.headers.get('x-content-type-options'), 'nosniff', at)
    assert.equal(r.headers.get('x-frame-options'), 'DENY', at)
    assert.equal(r.headers.get('referrer-policy'), 'same-origin', at)
    const csp = r.headers.get('content-security-policy') ?? ''
    for (const d of ["default-src 'self'", "frame-ancestors 'none'", "object-src 'none'", "base-uri 'self'",
      "form-action 'self'", "connect-src 'self'"]) assert.ok(csp.includes(d), `${at}: ${d}`)
    assert.equal(r.headers.get('strict-transport-security'), null, at)
  }
})

// V14.3.3: no framework banner (X-Powered-By: Next.js) on any answer.
test('next.config turns off the X-Powered-By banner', () => {
  assert.match(readFileSync('next.config.ts', 'utf8'), /poweredByHeader:\s*false/)
})
