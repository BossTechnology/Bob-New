// The routes the box-header check in CI requests are discovered, not listed:
// every page and route handler under app/, every file under public/, each
// with the access the box gives it (surface.ts). A route added later is
// checked without anyone remembering to add it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boxRoutes } from '../../scripts/ci/box-routes.mjs'
import { SURFACE } from './surface.ts'

const routes = boxRoutes('.')
const paths = routes.map((r) => r.path)

test('pages, route handlers and public files are all found, with their access', () => {
  for (const p of ['/', '/login', '/bob/performance', '/auth/login', '/auth/logout', '/api/health',
    '/api/bob/interactions', '/api/config/thresholds/x', '/dashboard.html', '/bob-live.mjs', '/api/ai']) {
    assert.ok(paths.includes(p), p)
  }
  const access = Object.fromEntries(routes.map((r) => [r.path, r.access]))
  assert.equal(access['/api/ai'], 'off')
  assert.equal(access['/api/health'], 'public')
  assert.equal(access['/api/bob/interactions'], 'session')
})

test('every rule of the box surface is exercised by at least one discovered path', () => {
  const covers = (rule: string) => paths.some((p) => rule === '/' ? p === '/'
    : rule.endsWith('/') ? p === rule.slice(0, -1) || p.startsWith(rule) : p === rule)
  assert.deepEqual([...SURFACE.public, ...SURFACE.session].filter((r) => !covers(r)), [])
})

test('API and auth answers are data; the rest are pages', () => {
  const data = Object.fromEntries(routes.map((r) => [r.path, r.data]))
  assert.deepEqual([data['/api/health'], data['/auth/me'], data['/bob/quality'], data['/dashboard.html']], [true, true, false, false])
})
