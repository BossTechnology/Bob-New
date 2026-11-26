// The role of a box account, read from bob.users as bob_app under the box's
// org claim. Needs BOB_TEST_DATABASE_URL, like projection-reader.test.ts.
//
// Henry, 2026-11-21 («Sin fila, 403»): no row, a row with active not true, or
// a role BOb does not serve is no role at all, and the box answers 403
// (box-proxy.ts, screen-gate.ts, box-auth.ts). There is no viewer fallback.
// P-1 closed by BOb-engine #34: bob_app reads its own organization's users.
//
// Henry, 2026-11-26 («Alta sola, como viewer»): with no row at all, the first
// visit of a live session takes a viewer seat (bob.claim_viewer_seat,
// BOb-engine #59). Inactive, another organization's or a refused seat is still
// no role.
import { test, before, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { boxRole, boxRoleOrSeat } from './roles.ts'

const URL = process.env.BOB_TEST_DATABASE_URL
const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const USER_A = 'aaaaaaaa-1111-4000-8000-000000000001'
// Rows of this test's own, written as the stack's owner and removed at the end.
const INACTIVE = 'aaaaaaaa-1111-4000-8000-0000000000e1'
const SERVICE = 'aaaaaaaa-1111-4000-8000-0000000000e2'
// Accounts the seat tests make; removed at the end.
const NEWCOMER = 'aaaaaaaa-1111-4000-8000-0000000000e3'
const NO_EMAIL = 'aaaaaaaa-1111-4000-8000-0000000000e4'
const SEATED = [NEWCOMER, NO_EMAIL]
const skip = URL ? false : 'BOB_TEST_DATABASE_URL not set'
const pool = URL ? new pg.Pool({ connectionString: URL, max: 1 }) : null

before(async () => {
  if (!pool) return
  await pool.query('DELETE FROM bob.users WHERE id = ANY($1::uuid[])', [[INACTIVE, SERVICE, ...SEATED]])
  await pool.query(`INSERT INTO bob.users (id, org_id, email, role, active) VALUES
    ($1, $3, 'inactive@example.com', 'admin', false),
    ($2, $3, 'service@example.com', 'service', true)`, [INACTIVE, SERVICE, TENANT_A])
})
after(async () => {
  if (!pool) return
  await pool.query('DELETE FROM bob.users WHERE id = ANY($1::uuid[])', [[INACTIVE, SERVICE, ...SEATED]])
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

const row = async (id: string) =>
  (await pool!.query('SELECT org_id::text, role, active, email FROM bob.users WHERE id = $1', [id])).rows

test('a first visit with no row takes an active viewer seat in the box\'s organization', { skip }, async () => {
  assert.equal(await boxRoleOrSeat(TENANT_A, { id: NEWCOMER, email: 'newcomer@example.com' }, pool!), 'viewer')
  assert.deepEqual(await row(NEWCOMER), [{ org_id: TENANT_A, role: 'viewer', active: true, email: 'newcomer@example.com' }])
  // The second visit reads the row; nothing is written again.
  assert.equal(await boxRoleOrSeat(TENANT_A, { id: NEWCOMER, email: 'other@example.com' }, pool!), 'viewer')
  assert.equal((await row(NEWCOMER))[0].email, 'newcomer@example.com')
})

test('an account with a row keeps its role, and no seat is taken', { skip }, async () => {
  assert.equal(await boxRoleOrSeat(TENANT_A, { id: USER_A, email: 'x@example.com' }, pool!), 'admin')
})

test('an inactive row stays inactive (403), not a new viewer', { skip }, async () => {
  assert.equal(await boxRoleOrSeat(TENANT_A, { id: INACTIVE, email: 'inactive@example.com' }, pool!), null)
  assert.deepEqual(await row(INACTIVE), [{ org_id: TENANT_A, role: 'admin', active: false, email: 'inactive@example.com' }])
})

test('another organization\'s account takes no seat in this box (403)', { skip }, async () => {
  const before = await row(USER_A)
  assert.equal(await boxRoleOrSeat(TENANT_B, { id: USER_A, email: 'a@example.com' }, pool!), null)
  assert.deepEqual(await row(USER_A), before)
})

test('a GoTrue account with no email takes no seat (403)', { skip }, async () => {
  assert.equal(await boxRoleOrSeat(TENANT_A, { id: NO_EMAIL, email: null }, pool!), null)
  assert.deepEqual(await row(NO_EMAIL), [])
})
