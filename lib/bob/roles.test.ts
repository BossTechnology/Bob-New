// The role of a box account, read from bob.users as bob_app under the box's
// org claim. Needs BOB_TEST_DATABASE_URL, like projection-reader.test.ts.
//
// Henry, 2026-11-21 («Sin fila, 403»): no row, a row with active not true, or
// a role BOb does not serve is no role at all, and the box answers 403
// (box-proxy.ts, screen-gate.ts, box-auth.ts). There is no viewer fallback.
// P-1 closed by BOb-engine #34: bob_app reads its own organization's users.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { boxRole } from './roles.ts'

const URL = process.env.BOB_TEST_DATABASE_URL
const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const USER_A = 'aaaaaaaa-1111-4000-8000-000000000001'
// Rows of this test's own, written as the stack's owner and removed at the end.
const INACTIVE = 'aaaaaaaa-1111-4000-8000-0000000000e1'
const SERVICE = 'aaaaaaaa-1111-4000-8000-0000000000e2'
const skip = URL ? false : 'BOB_TEST_DATABASE_URL not set'
const pool = URL ? new pg.Pool({ connectionString: URL, max: 1 }) : null

before(async () => {
  if (!pool) return
  await pool.query('DELETE FROM bob.users WHERE id = ANY($1::uuid[])', [[INACTIVE, SERVICE]])
  await pool.query(`INSERT INTO bob.users (id, org_id, email, role, active) VALUES
    ($1, $3, 'inactive@example.com', 'admin', false),
    ($2, $3, 'service@example.com', 'service', true)`, [INACTIVE, SERVICE, TENANT_A])
})
after(async () => {
  if (!pool) return
  await pool.query('DELETE FROM bob.users WHERE id = ANY($1::uuid[])', [[INACTIVE, SERVICE]])
  await pool.end()
})

test('an active account of the box\'s organization has its role', { skip }, async () => {
  assert.equal(await boxRole(TENANT_A, USER_A, pool!), 'admin')
})

test('another organization\'s account has no role under this claim (403)', { skip }, async () => {
  assert.equal(await boxRole(TENANT_B, USER_A, pool!), null)
})

test('an unknown account has no role (403), not viewer', { skip }, async () => {
  assert.equal(await boxRole(TENANT_A, '00000000-0000-4000-8000-000000000000', pool!), null)
})

test('an inactive account has no role (403)', { skip }, async () => {
  assert.equal(await boxRole(TENANT_A, INACTIVE, pool!), null)
})

test('a role BOb does not serve in the box (service, demo) is no role (403)', { skip }, async () => {
  assert.equal(await boxRole(TENANT_A, SERVICE, pool!), null)
})
