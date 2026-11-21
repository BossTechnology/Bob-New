// The connection itself: it must not hang, must not crash the process when
// Postgres restarts, must bound every statement, and must refuse a login that
// could skip RLS (review of PR #30, point 3 and the session_user check).
//
// The live tests need BOB_TEST_DATABASE_URL (see projection-reader.test.ts).
// That login is the stack's postgres, a superuser: exactly what the default
// pool must refuse.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {
  asBobApp, checkLoginAtStartup, createPool, getPool, privilegedLogin, PrivilegedLoginError, POOL_OPTIONS, STATEMENT_TIMEOUT,
} from './db.ts'

const URL = process.env.BOB_TEST_DATABASE_URL
const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const skip = URL ? false : 'BOB_TEST_DATABASE_URL not set'
const pool = URL ? new pg.Pool({ connectionString: URL, max: 1 }) : null
after(async () => { await pool?.end() })

test('the pool gives up connecting instead of waiting forever', () => {
  assert.ok(POOL_OPTIONS.connectionTimeoutMillis > 0 && POOL_OPTIONS.connectionTimeoutMillis <= 5000)
})

test('an idle client dying does not take the process down', async () => {
  const saved = process.env.BOB_DATABASE_URL
  process.env.BOB_DATABASE_URL = 'postgresql://nobody:nothing@127.0.0.1:1/none'
  try {
    const p = getPool()
    assert.ok(p.listenerCount('error') >= 1, 'no error listener on the pool')
    // Unreachable: rejects within the connection timeout, does not hang.
    const t0 = Date.now()
    await assert.rejects(asBobApp(TENANT_A, async () => 1))
    assert.ok(Date.now() - t0 < POOL_OPTIONS.connectionTimeoutMillis + 2000)
    await p.end()
  } finally {
    if (saved === undefined) delete process.env.BOB_DATABASE_URL; else process.env.BOB_DATABASE_URL = saved
  }
})

test('every transaction carries a statement timeout', { skip }, async () => {
  const v = await asBobApp(TENANT_A, async (db) => (await db.query('SHOW statement_timeout')).rows[0].statement_timeout, pool!)
  assert.equal(v, STATEMENT_TIMEOUT)
})

test('a superuser login is privileged', { skip }, async () => {
  const c = await pool!.connect()
  try {
    assert.equal(await privilegedLogin(c), true)
  } finally {
    c.release()
  }
})

test('the app pool refuses a privileged login, and keeps refusing', { skip }, async () => {
  const app = createPool({ kind: 'url', connectionString: URL! })
  try {
    await assert.rejects(asBobApp(TENANT_A, async () => 1, app), PrivilegedLoginError)
    await assert.rejects(asBobApp(TENANT_A, async () => 1, app), PrivilegedLoginError)
    await assert.rejects(checkLoginAtStartup(app), PrivilegedLoginError)
  } finally {
    await app.end()
  }
})
