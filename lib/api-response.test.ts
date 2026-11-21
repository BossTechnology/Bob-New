// How a failure reaches the client. In the box no database or identity
// detail leaves the server: a pg error can name a host, a port or a login.
// Outside the box (the Vercel demo) the behaviour is the one it always had.
import { test, afterEach } from 'node:test'
import assert from 'node:assert/strict'
import { handle, serverErr, ApiError } from './api-response.ts'
import { BobDbError } from './bob/db-error.ts'

const saved = process.env.BOB_CAJA
afterEach(() => { if (saved === undefined) delete process.env.BOB_CAJA; else process.env.BOB_CAJA = saved })
const box = () => { process.env.BOB_CAJA = '1' }
const body = async (r: Response) => JSON.stringify(await r.json())
const quiet = <T>(fn: () => T): T => { const e = console.error; console.error = () => {}; try { return fn() } finally { console.error = e } }

test('in the box a connection failure is a 503 that names nothing', async () => {
  box()
  const refused = Object.assign(new Error('connect ECONNREFUSED 10.0.0.7:5432'), { code: 'ECONNREFUSED' })
  const r = quiet(() => handle(refused))
  assert.equal(r.status, 503)
  assert.doesNotMatch(await body(r), /10\.0\.0\.7|5432|ECONNREFUSED/)

  const login = quiet(() => handle(new BobDbError('password authentication failed for user "bob_app"', '28P01')))
  assert.equal(login.status, 503)
  assert.doesNotMatch(await body(login), /password|bob_app/)

  const pool = quiet(() => handle(new Error('timeout exceeded when trying to connect')))
  assert.equal(pool.status, 503)
})

test('in the box an unknown failure is a 500 with a generic text', async () => {
  box()
  const r = quiet(() => serverErr(new Error('relation bob.secret_table does not exist')))
  assert.equal(r.status, 500)
  assert.doesNotMatch(await body(r), /secret_table/)
})

test('in the box a table error is mapped, never "[object Object]"', async () => {
  box()
  const cases: [string, number][] = [['23505', 409], ['42501', 403], ['23514', 400], ['22P02', 400],
    ['23503', 400], ['PGRST116', 404], ['BOB_QUERY', 400], ['57014', 503]]
  for (const [code, status] of cases) {
    const r = quiet(() => handle(new BobDbError(`detail for ${code}`, code)))
    assert.equal(r.status, status, code)
    const b = await body(r)
    assert.doesNotMatch(b, /object Object/)
    assert.doesNotMatch(b, /detail for/)
  }
  // A plain object thrown by older code is still mapped by its code.
  assert.equal(quiet(() => handle({ message: 'dup', code: '23505' })).status, 409)
})

test('an ApiError keeps its status and its own text, in and out of the box', async () => {
  box()
  const r = handle(new ApiError(403, 'Role viewer is not permitted for this endpoint'))
  assert.equal(r.status, 403)
  assert.match(await body(r), /Role viewer/)
})

test('outside the box serverErr is unchanged', async () => {
  delete process.env.BOB_CAJA
  const r = serverErr(new Error('boom'))
  assert.equal(r.status, 500)
  assert.deepEqual(await r.json(), { ok: false, error: 'boom' })
})
