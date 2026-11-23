// Signing in to the box: throttling and the record of each decision
// (ASVS 4.0.3 V2.2.1, V7.1.1, V7.2.1, V7.3.1).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { Attempts, KnownAddresses, accountKey, boxLogin, clientIp, type LoginDeps } from './login.ts'
import type { SessionResult } from './gotrue.ts'
import { loginErrorText } from './login-text.ts'

const SESSION = { kind: 'session', session: { access_token: 'at-secret', refresh_token: 'rt-secret', expires_in: 3600 } } as const
const BODY = { email: 'user@example.com', password: 'wrong-password' }

function setup(result: SessionResult = { kind: 'unauthorized' }) {
  const lines: string[] = []
  const calls = { grants: 0, sessions: 0 }
  let now = 0
  const deps: LoginDeps = {
    grant: async () => { calls.grants++; return result },
    setSession: async () => { calls.sessions++ },
    byIp: new Attempts(10, 60_000, () => now),
    byAccount: new Attempts(20, 15 * 60_000, () => now),
    byKnown: new Attempts(20, 15 * 60_000, () => now),
    known: new KnownAddresses(30 * 24 * 3600_000, 1000, () => now),
    log: (line) => { lines.push(line) },
  }
  return { deps, lines, calls, later: (ms: number) => { now += ms }, answer: (r: SessionResult) => { result = r } }
}

test('the client is the entry written by the last trusted proxy, not what the client claims', () => {
  assert.equal(clientIp('203.0.113.9, 10.0.0.7', 1), '10.0.0.7')
  assert.equal(clientIp('10.0.0.7', 1), '10.0.0.7')
  // A balancer in front of Traefik: two trusted hops.
  assert.equal(clientIp('203.0.113.9, 198.51.100.4, 10.0.0.2', 2), '198.51.100.4')
  // Fewer entries than trusted proxies: the request did not come through them.
  assert.equal(clientIp(null, 1), 'direct')
  assert.equal(clientIp('10.0.0.7', 2), 'direct')
})


test('a stranger who knows the email cannot lock its owner out of an address that has signed in before', async () => {
  const { deps, answer } = setup(SESSION)
  assert.equal((await boxLogin(BODY, '10.9.9.9', deps)).status, 200) // the owner, from home
  answer({ kind: 'unauthorized' })
  for (let i = 0; i < 25; i++) await boxLogin(BODY, `10.0.${i}.1`, deps) // someone else, anywhere
  answer(SESSION)
  assert.equal((await boxLogin(BODY, '10.9.9.9', deps)).status, 200, 'the owner still gets in from home')
  // From an address never seen, the account's own limit still holds.
  assert.equal((await boxLogin(BODY, '10.8.8.8', deps)).status, 429)
})

test('a known address is still limited for that account', async () => {
  const { deps, answer, calls, later } = setup(SESSION)
  await boxLogin(BODY, '10.9.9.9', deps)
  later(60_000)
  answer({ kind: 'unauthorized' })
  const before = calls.grants
  for (let i = 0; i < 30; i++) await boxLogin(BODY, '10.9.9.9', deps)
  assert.equal(calls.grants - before, 10, 'the address limit (10 a minute) still applies')
})

test('the account in the log is keyed, not a plain hash of the email', () => {
  const plain = createHash('sha256').update('user@example.com').digest('hex')
  assert.ok(!plain.startsWith(accountKey('user@example.com').slice(0, 16)))
  assert.equal(accountKey(' USER@example.com '), accountKey('user@example.com'))
})

test('the login form says why it refused', () => {
  assert.match(loginErrorText(429), /intentos/)
  assert.match(loginErrorText(503), /no responde/)
  assert.match(loginErrorText(401), /inválidas/)
  assert.match(loginErrorText(403), /otro origen|recarga/i)
})

test('one account cannot be guessed at by changing address or the case of the email', async () => {
  const { deps, calls } = setup()
  const status: number[] = []
  for (let i = 0; i < 25; i++) {
    const email = i % 2 ? ' USER@example.com ' : BODY.email
    status.push((await boxLogin({ ...BODY, email }, `10.0.0.${i}`, deps)).status)
  }
  assert.deepEqual(status, [...Array(20).fill(401), ...Array(5).fill(429)])
  assert.equal(calls.grants, 20, 'a refused attempt never reaches GoTrue')
})

test('no more than 100 attempts an hour on one account (V2.2.1)', async () => {
  const { deps, calls, later } = setup()
  for (let minute = 0; minute < 60; minute++) {
    for (let i = 0; i < 5; i++) await boxLogin(BODY, `10.0.${minute}.${i}`, deps)
    later(60_000)
  }
  assert.ok(calls.grants <= 100, String(calls.grants))
})

test('one address cannot spray many accounts', async () => {
  const { deps } = setup()
  let last = 0
  for (let i = 0; i < 11; i++) last = (await boxLogin({ ...BODY, email: `user${i}@example.com` }, '10.0.0.7', deps)).status
  assert.equal(last, 429)
})

test('signing in clears the account\'s count', async () => {
  const { deps, answer } = setup()
  for (let i = 0; i < 19; i++) await boxLogin(BODY, `10.0.0.${i}`, deps)
  answer(SESSION)
  assert.equal((await boxLogin(BODY, '10.0.1.1', deps)).status, 200)
  answer({ kind: 'unauthorized' })
  assert.equal((await boxLogin(BODY, '10.0.1.2', deps)).status, 401)
})

test('old counts are forgotten, so invented emails cannot grow the memory for ever', () => {
  let now = 0
  const a = new Attempts(5, 1000, () => now)
  for (let i = 0; i < 1000; i++) a.take(`k${i}`)
  now = 5000
  a.take('fresh')
  assert.equal(a.size, 1)
})

test('a body without two reasonable strings is a 400 and never reaches GoTrue', async () => {
  const { deps, calls } = setup()
  for (const b of [null, {}, { email: 1, password: 'x' }, { email: 'a@example.com', password: ['x'] },
    { email: `${'a'.repeat(400)}@example.com`, password: 'x' }, { email: 'a@example.com', password: 'x'.repeat(2000) }]) {
    assert.equal((await boxLogin(b, `10.0.0.${Math.random()}`, deps)).status, 400)
  }
  assert.equal(calls.grants, 0)
})

test('every decision is one JSON line, without password, token or email', async () => {
  const { deps, lines, answer } = setup()
  await boxLogin(BODY, '10.0.0.1\n{"event":"forged"}', deps)
  answer(SESSION)
  await boxLogin(BODY, '10.0.0.2', deps)
  answer({ kind: 'unavailable' })
  await boxLogin(BODY, '10.0.0.3', deps)
  assert.deepEqual(lines.map((l) => JSON.parse(l).event), ['login.refused', 'login.ok', 'login.unavailable'])
  for (const l of lines) {
    assert.ok(!l.includes('\n'))
    assert.doesNotMatch(l, /wrong-password|at-secret|rt-secret|user@example\.com/)
    const { at, account, ip } = JSON.parse(l)
    assert.ok(!Number.isNaN(Date.parse(at)) && account && ip)
  }
})

test('known addresses expire and stay bounded', () => {
  let now = 0
  const k = new KnownAddresses(1000, 3, () => now)
  for (const a of ['a', 'b', 'c', 'd']) k.add(a)
  assert.equal(k.size, 3)
  assert.equal(k.has('a'), false, 'the oldest goes first')
  now = 2000
  assert.equal(k.has('d'), false)
})
