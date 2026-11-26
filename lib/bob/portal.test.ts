// BOb's login is the BzzzBX portal's (Henry, 2026-11-26: «para entrar al bob
// deben tener el login de bzzzbx … se quita el login de bob», and «H1: el
// portal pasa el token»). The portal hands the access token in the URL
// fragment of /entrar; the page posts it to /auth/portal, which asks GoTrue
// who it is before it becomes BOb's session cookie.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  adoptPortalToken, handover, PORTAL_COOKIE, portalLoginUrl, portalLogoutUrl, portalUrl, safeNext,
  type AdoptDeps,
} from './portal.ts'
import { ACCESS_COOKIE, REFRESH_COOKIE, type CookieJar, type CookieOptions } from './session.ts'
import { BobConfigError, boxEnvProblems } from './runtime.ts'
import { Attempts } from './login.ts'

test('BOB_PORTAL_URL is an https origin, and nothing else', () => {
  assert.equal(portalUrl({ BOB_PORTAL_URL: 'https://febor.bzzzbx.example' }), 'https://febor.bzzzbx.example')
  assert.equal(portalUrl({ BOB_PORTAL_URL: 'https://portal.example:8443/' }), 'https://portal.example:8443')
  for (const v of [undefined, '', 'http://portal.example', 'https://portal.example/login', 'https://u:p@portal.example',
    'https://portal.example/?x=1', 'javascript:alert(1)', 'portal.example']) {
    assert.throws(() => portalUrl({ BOB_PORTAL_URL: v }), BobConfigError, String(v))
  }
})

test('a box without BOB_PORTAL_URL does not start', () => {
  const env = {
    BOB_CAJA: '1', BOB_ORG_ID: 'aaaaaaaa-0000-4000-8000-000000000001', BOB_GOTRUE_URL: 'http://bzzz-supabase-auth:9999',
    BOB_DB_HOST: 'bzzz-supabase-db',
  }
  const read = () => 'BOB_APP_USUARIO=bob_app\nBOB_APP_CLAVE=example-only\n'
  assert.ok(boxEnvProblems(env, read).some((p) => /BOB_PORTAL_URL/.test(p)))
  assert.deepEqual(boxEnvProblems({ ...env, BOB_PORTAL_URL: 'https://portal.example' }, read), [])
})

test('the way out to the portal comes back to the same BOb page, over https', () => {
  assert.equal(portalLoginUrl('https://portal.example', 'bob.example', '/bob/quality?range=today'),
    'https://portal.example/?volver=https%3A%2F%2Fbob.example%2Fbob%2Fquality%3Frange%3Dtoday')
  assert.equal(portalLogoutUrl('https://portal.example'), 'https://portal.example/?salir=1')
})

test('after the handover BOb only opens one of its own paths', () => {
  assert.equal(safeNext('/bob/quality?range=today'), '/bob/quality?range=today')
  assert.equal(safeNext('/'), '/')
  for (const bad of [null, '', 'https://evil.example/', '//evil.example', '/\\evil.example', 'bob/quality',
    '/entrar', '/entrar?x', '/login', '\t/x', '/%0d%0aSet-Cookie:x']) {
    assert.equal(safeNext(bad), '/bob/performance', String(bad))
  }
})

// A jar that records what was set, as the route's cookies() does.
function jar(start: Record<string, string> = {}) {
  const set: Record<string, { value: string; options: CookieOptions }> = {}
  const j: CookieJar = {
    get: (n) => start[n],
    set: (n, value, options) => { set[n] = { value, options } },
  }
  return { j, set }
}

// A token whose payload says it lasts 600 s more. Its signature is not ours to
// check: GoTrue answered for it before its exp is read.
const token = (exp: number) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ sub: 'x', exp })).toString('base64url')}.sig`
const NOW = 1_800_000_000_000
const deps = (o: Partial<AdoptDeps> = {}): AdoptDeps => ({
  getUser: async () => ({ kind: 'user', user: { id: 'aaaaaaaa-1111-4000-8000-000000000001', email: 'user@example.com' } }),
  budget: new Attempts(10, 60_000),
  now: () => NOW,
  log: () => {},
  ...o,
})

test('a token GoTrue answers for becomes BOb\'s access cookie, for as long as it lives', async () => {
  const { j, set } = jar({ [PORTAL_COOKIE]: '1', [REFRESH_COOKIE]: 'old' })
  const t = token(NOW / 1000 + 600)
  const r = await adoptPortalToken({ access_token: t }, '203.0.113.5', j, deps())
  assert.equal(r.status, 200)
  assert.equal(set[ACCESS_COOKIE].value, t)
  assert.equal(set[ACCESS_COOKIE].options.maxAge, 600)
  assert.equal(set[ACCESS_COOKIE].options.httpOnly, true)
  // BOb holds no refresh token of its own: the portal's rotation never collides with one here.
  assert.equal(set[REFRESH_COOKIE].options.maxAge, 0)
  assert.equal(set[PORTAL_COOKIE].options.maxAge, 0)
  const body = await r.json()
  assert.equal(JSON.stringify(body).includes(t), false, 'the token must not come back in the body')
})

test('a token that says it lasts longer is capped at an hour; one with no exp gets the hour', async () => {
  for (const [t, max] of [[token(NOW / 1000 + 86_400), 3600], ['a.b.c', 3600]] as const) {
    const { j, set } = jar()
    assert.equal((await adoptPortalToken({ access_token: t }, 'ip', j, deps())).status, 200)
    assert.equal(set[ACCESS_COOKIE].options.maxAge, max)
  }
})

test('a forged or expired token is refused by GoTrue: 401 and no cookie', async () => {
  const { j, set } = jar()
  const r = await adoptPortalToken({ access_token: token(NOW / 1000 - 10) }, 'ip', j,
    deps({ getUser: async () => ({ kind: 'unauthorized' }) }))
  assert.equal(r.status, 401)
  assert.equal(set[ACCESS_COOKIE], undefined)
})

test('GoTrue down is a 503 and no cookie, not a 401', async () => {
  const { j, set } = jar()
  const r = await adoptPortalToken({ access_token: 'x.y.z' }, 'ip', j, deps({ getUser: async () => ({ kind: 'unavailable' }) }))
  assert.equal(r.status, 503)
  assert.equal(set[ACCESS_COOKIE], undefined)
})

test('a missing, odd or huge token is a 400 and GoTrue is not asked', async () => {
  const never = deps({ getUser: async () => { throw new Error('must not be called') } })
  for (const body of [null, {}, { access_token: 42 }, { access_token: '' }, { access_token: 'x'.repeat(8193) },
    { access_token: 'has spaces in it' }]) {
    const { j, set } = jar()
    assert.equal((await adoptPortalToken(body, 'ip', j, never)).status, 400, JSON.stringify(body)?.slice(0, 40))
    assert.equal(set[ACCESS_COOKIE], undefined)
  }
})

test('guessing tokens from one address is throttled', async () => {
  const d = deps({ budget: new Attempts(2, 60_000), getUser: async () => ({ kind: 'unauthorized' }) })
  for (let i = 0; i < 2; i++) assert.equal((await adoptPortalToken({ access_token: 'a.b.c' }, 'ip', jar().j, d)).status, 401)
  assert.equal((await adoptPortalToken({ access_token: 'a.b.c' }, 'ip', jar().j, d)).status, 429)
})

// The page's side, in the browser.
function page(hash: string, answer: { status: number } | 'throws') {
  const steps: string[] = []
  return {
    steps,
    run: () => handover({
      hash,
      clearHash: () => steps.push('clear'),
      post: async (_url, init) => {
        steps.push(`post ${JSON.parse(String(init?.body)).access_token}`)
        if (answer === 'throws') throw new TypeError('fetch failed')
        return new Response('{}', { status: answer.status })
      },
      replace: (u) => steps.push(`replace ${u}`),
      show: (m) => steps.push(`show ${m}`),
    }),
  }
}

test('the page clears the fragment first, posts the token once, then opens where the person was going', async () => {
  const p = page('#bob_at=a.b.c&ir=%2Fbob%2Fquality', { status: 200 })
  await p.run()
  assert.deepEqual(p.steps, ['clear', 'post a.b.c', 'replace /bob/quality'])
})

test('without a token, or with one refused, the page says so and does not send the person back (no loop)', async () => {
  for (const [hash, answer] of [['', { status: 200 }], ['#ir=%2F', { status: 200 }], ['#bob_at=a.b.c', { status: 401 }],
    ['#bob_at=a.b.c', { status: 503 }], ['#bob_at=a.b.c', 'throws']] as const) {
    const p = page(hash, answer)
    await p.run()
    assert.ok(!p.steps.some((s) => s.startsWith('replace')), `${hash} ${JSON.stringify(answer)}: ${p.steps}`)
    assert.ok(p.steps.some((s) => s.startsWith('show')), hash)
    assert.equal(p.steps[0], 'clear')
  }
})

test('a destination that is not one of BOb\'s own paths opens the screens instead', async () => {
  const p = page('#bob_at=a.b.c&ir=https%3A%2F%2Fevil.example', { status: 200 })
  await p.run()
  assert.deepEqual(p.steps.at(-1), 'replace /bob/performance')
})
