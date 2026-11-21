import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readdirSync, statSync } from 'node:fs'
import { join, sep } from 'node:path'
import { boxAccess } from './surface.ts'

test('category (ii) is off in the box: AI, Twilio, Resend, Slack and every cron', () => {
  for (const p of [
    '/api/ai', '/api/ai/chat', '/api/ai/sentiment',
    '/api/notify/email', '/api/notify/sms', '/api/notify/call', '/api/notify/slack',
    '/api/twilio/status', '/api/twilio/twiml', '/api/slack/action',
    '/api/cron/metric-refresh', '/api/cron/alert-evaluation', '/api/cron/autobotz-reverify',
    '/auth/signup', '/demo',
  ]) assert.equal(boxAccess(p), 'off', p)
})

test('category (iii) is off in the box until bob has an equivalent', () => {
  for (const p of [
    '/api/alerts', '/api/anomalies/summary', '/api/interactions', '/api/interactions/batch',
    '/api/metrics/trend', '/api/sentiment', '/api/admin/seed', '/api/admin/orgs',
    '/api/config', '/api/config/export', '/api/config/import', '/api/config/autobotz',
    '/api/config/alerts', '/api/channels', '/api/reports/generate', '/api/rules',
    '/auth/reset-password', '/auth/confirm-reset', '/coop.html', '/icon/bob-bee.png', '/demo.js',
  ]) assert.equal(boxAccess(p), 'off', p)
})

test('category (i) needs a session', () => {
  for (const p of [
    '/', '/bob/performance', '/bob/interactions', '/bob/quality', '/api/bob/quality',
    '/api/config/thresholds', '/api/config/thresholds/csat', '/api/config/channels/x',
    '/api/config/responses', '/api/config/anomalies/x', '/api/config/textrules/temas',
    '/auth/me', '/auth/logout', '/auth/refresh',
  ]) assert.equal(boxAccess(p), 'session', p)
})

test('only the login and the healthcheck are public', () => {
  for (const p of ['/login', '/auth/login', '/api/health', '/_next/static/x.js']) {
    assert.equal(boxAccess(p), 'public', p)
  }
  assert.equal(boxAccess('/api/healthz'), 'off')
  assert.equal(boxAccess('/bobx'), 'off')
})

// Every route file in app/ is classified: a route nobody looked at is off.
test('every route in app/ resolves to one access, and new ones default to off', () => {
  const routes: string[] = []
  const walk = (dir: string) => {
    for (const f of readdirSync(dir)) {
      const p = join(dir, f)
      if (statSync(p).isDirectory()) walk(p)
      else if (/^(route|page)\.tsx?$/.test(f)) routes.push(dir)
    }
  }
  walk('app')
  const served = routes
    .map((d) => '/' + d.split(sep).slice(1).join('/').replace(/\[[^\]]+\]/g, 'x'))
    .map((p) => (p === '/' ? '/' : p))
    .filter((p) => boxAccess(p) !== 'off')
    .sort()
  assert.deepEqual(served, [
    '/',
    '/api/bob/interactions', '/api/bob/performance', '/api/bob/quality',
    '/api/config/anomalies', '/api/config/anomalies/x',
    '/api/config/channels', '/api/config/channels/x',
    '/api/config/responses', '/api/config/responses/x',
    '/api/config/textrules', '/api/config/textrules/x',
    '/api/config/thresholds', '/api/config/thresholds/x',
    '/api/health',
    '/auth/login', '/auth/logout', '/auth/me', '/auth/refresh',
    '/bob/interactions', '/bob/performance', '/bob/quality',
    '/login',
  ])
})

// P-4: the simulator paints bob's projections in the box, so it and its
// painter are served with a session. The rest of public/ stays off.
test('the simulator and its painter need a session in the box', () => {
  for (const p of ['/dashboard.html', '/bob-live.mjs']) assert.equal(boxAccess(p), 'session', p)
  for (const p of ['/dashboard.htm', '/dashboard.html/x', '/bob-live.js', '/coop.html']) {
    assert.equal(boxAccess(p), 'off', p)
  }
})
