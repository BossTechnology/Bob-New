// The container's healthcheck in the box. Bzzz's compose gives it 5 s
// (compose/l7-bob.yml): the answer must be a 503 well inside that, not a
// timeout, when the database or GoTrue does not answer.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { boxHealth, HEALTH_BUDGET_MS } from './health.ts'
import { BobConfigError } from './runtime.ts'

const never = () => new Promise<never>(() => {})
const quiet = async <T>(fn: () => Promise<T>) => {
  const e = console.error; console.error = () => {}
  try { return await fn() } finally { console.error = e }
}

test('the budget leaves room inside the 5 s healthcheck', () => {
  assert.ok(HEALTH_BUDGET_MS <= 2500)
})

test('both up is 200', async () => {
  const r = await boxHealth({ db: async () => {}, identity: async () => true })
  assert.equal(r.status, 200)
  assert.deepEqual(await r.json(), { status: 'ok', db: 'ok', identity: 'ok', version: '1.0.0' })
})

test('a database and a GoTrue that never answer are a 503 within the budget, checked in parallel', async () => {
  const t0 = Date.now()
  const r = await quiet(() => boxHealth({ db: never, identity: never }))
  const took = Date.now() - t0
  assert.equal(r.status, 503)
  assert.ok(took < HEALTH_BUDGET_MS + 500, `took ${took} ms`)
  const b = await r.json()
  assert.equal(b.db, 'error')
  assert.equal(b.identity, 'error')
})

test('one down is enough for a 503, and the body says which', async () => {
  const r = await quiet(() => boxHealth({ db: async () => { throw new Error('ECONNREFUSED 10.0.0.7') }, identity: async () => true }))
  assert.equal(r.status, 503)
  const b = await r.json()
  assert.equal(b.db, 'error')
  assert.equal(b.identity, 'ok')
  assert.doesNotMatch(JSON.stringify(b), /10\.0\.0\.7/)
})

test('GoTrue not configured reads as unconfigured', async () => {
  const r = await boxHealth({ db: async () => {}, identity: async () => { throw new BobConfigError('BOB_GOTRUE_URL no está definida') } })
  assert.equal(r.status, 503)
  assert.equal((await r.json()).identity, 'unconfigured')
})
