// The box's browser-side headers (security-headers.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { NextRequest } from 'next/server.js'
import { boxProxy, type BoxProxyDeps } from './box-proxy.ts'
import type { SessionState } from './session.ts'

const USER = { kind: 'user', user: { id: 'aaaaaaaa-1111-4000-8000-000000000001', email: 'user@example.com' } } as SessionState
const deps = (o: Partial<BoxProxyDeps> = {}): BoxProxyDeps => ({
  gotrueUrl: () => 'http://gotrue.test',
  resolveSession: async () => USER,
  role: async () => 'viewer',
  ...o,
})
const req = (path: string) => new NextRequest(`http://box.test${path}`)

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

// ASVS 4.0.3 V14.4.2: an API answer opened directly in the browser is a
// download, never a page rendered from its content.
test('API answers are attachments; pages are not', async () => {
  for (const p of ['/api/bob/interactions', '/api/config/thresholds', '/api/health', '/auth/me', '/api/nope.json']) {
    assert.equal((await boxProxy(req(p), deps())).headers.get('content-disposition'), 'attachment', p)
  }
  for (const p of ['/login', '/bob/performance', '/dashboard.html']) {
    assert.equal((await boxProxy(req(p), deps())).headers.get('content-disposition'), null, p)
  }
})
