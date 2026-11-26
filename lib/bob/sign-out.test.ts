// Signing out of the box (ASVS 4.0.3 V3.3.1, V8.2.3): the session ends at
// GoTrue and the page that showed bob's figures is replaced, not kept.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { signOut } from './sign-out.ts'
import { boxLogout } from './logout.ts'
import type { CookieJar } from './session.ts'

test('signing out ends the session, then replaces the page with /login', async () => {
  const steps: string[] = []
  await signOut(async (url, init) => { steps.push(`${init?.method} ${url}`); return new Response('{}') },
    (url) => { steps.push(`replace ${url}`) })
  assert.deepEqual(steps, ['POST /auth/logout', 'replace /login'])
})

// Henry, 2026-11-26: the session is the portal's, so leaving BOb leaves
// BzzzBX too, and the portal says so (its ?salir=1).
test('in the box, signing out goes to the portal\'s way out that the answer names', async () => {
  const steps: string[] = []
  await signOut(async () => Response.json({ ok: true, data: { signed_out: true, next: 'https://portal.example/?salir=1' } }),
    (url) => { steps.push(url) })
  assert.deepEqual(steps, ['https://portal.example/?salir=1'])
  for (const next of ['http://portal.example/', '//evil.example', 'javascript:alert(1)', 42]) {
    const s2: string[] = []
    await signOut(async () => Response.json({ ok: true, data: { next } }), (url) => { s2.push(url) })
    assert.deepEqual(s2, ['/login'], String(next))
  }
})

test('the box\'s logout answer names the portal\'s way out', async () => {
  const cookies: string[] = []
  const jar: CookieJar = { get: () => undefined, set: (n) => { cookies.push(n) } }
  const r = await boxLogout(jar, async () => 'revoked', () => {}, 'https://portal.example/?salir=1')
  assert.equal((await r.json()).data.next, 'https://portal.example/?salir=1')
})

test('the page goes even when the request fails', async () => {
  const steps: string[] = []
  await signOut(async () => { throw new TypeError('fetch failed') }, (url) => { steps.push(url) })
  assert.deepEqual(steps, ['/login'])
})

test('every box screen offers it', () => {
  const parts = readFileSync('app/bob/screen-parts.tsx', 'utf8')
  assert.match(parts, /export function ScreenNav[\s\S]*<SignOut \/>/)
  const live = readFileSync('public/bob-live.mjs', 'utf8')
  assert.match(live, /function enableSignOut\(\)/)
  assert.match(live, /enableThresholds\(\)\s*\n\s*enableSignOut\(\)/)
})

// Behaviour, not text: replace() keeps the signed-in page out of the history;
// assign() would leave it one Back away.
function fakeWindow() {
  const calls: string[] = []
  const g = globalThis as Record<string, unknown>
  const saved = { window: g.window, document: g.document, fetch: g.fetch }
  g.window = { location: { replace: (u: string) => calls.push(`replace ${u}`), assign: (u: string) => calls.push(`assign ${u}`) } }
  return { calls, restore: () => Object.assign(g, saved) }
}

test('the default navigation replaces the page', async () => {
  const w = fakeWindow()
  try {
    await signOut(async () => new Response('{}'))
  } finally { w.restore() }
  assert.deepEqual(w.calls, ['replace /login'])
})

test('the live dashboard\'s button posts the logout, then replaces the page', async () => {
  const { enableSignOut } = await import('../../public/bob-live.mjs')
  const w = fakeWindow()
  const g = globalThis as Record<string, unknown>
  let button: { onclick: () => Promise<void> } | null = null
  g.document = {
    getElementById: () => null,
    createElement: () => ({ style: {} }),
    body: { appendChild: (el: { onclick: () => Promise<void> }) => { button = el } },
  }
  g.fetch = async (url: string, init: RequestInit) => { w.calls.push(`${init?.method ?? 'GET'} ${url}`); return new Response('{}') }
  try {
    enableSignOut()
    await button!.onclick()
  } finally { w.restore() }
  assert.deepEqual(w.calls, ['POST /auth/logout', 'replace /login'])
})

test('in the box, the live dashboard\'s button goes to the portal\'s way out too', async () => {
  const { enableSignOut } = await import('../../public/bob-live.mjs')
  const w = fakeWindow()
  const g = globalThis as Record<string, unknown>
  let button: { onclick: () => Promise<void> } | null = null
  g.document = {
    getElementById: () => null,
    createElement: () => ({ style: {} }),
    body: { appendChild: (el: { onclick: () => Promise<void> }) => { button = el } },
  }
  g.fetch = async () => Response.json({ ok: true, data: { next: 'https://portal.example/?salir=1' } })
  try {
    enableSignOut()
    await button!.onclick()
  } finally { w.restore() }
  assert.deepEqual(w.calls, ['replace https://portal.example/?salir=1'])
})

function jar() {
  const store = new Map<string, string>([['__Host-bob-at', 'at']])
  const j: CookieJar & { store: Map<string, string> } = { store, get: (n) => store.get(n), set: (n, v) => { store.set(n, v) } }
  return j
}

test('the logout answer says whether the session was revoked, and clears the cache', async () => {
  for (const [result, revoked] of [['revoked', true], ['unauthorized', true], ['unavailable', false]] as const) {
    const j = jar()
    const lines: string[] = []
    const res = await boxLogout(j, async () => result, (l) => { lines.push(l) })
    assert.equal(res.status, 200)
    assert.deepEqual((await res.json()).data, { signed_out: true, revoked })
    assert.equal(res.headers.get('clear-site-data'), '"cache"')
    assert.equal(j.store.get('__Host-bob-at'), '', 'the cookies go either way')
    assert.equal(JSON.parse(lines[0]).event, revoked ? 'logout.ok' : 'logout.not_revoked')
  }
})
