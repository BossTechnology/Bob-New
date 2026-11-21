// The role of a box account, read as bob_app (inventario P-1). Needs
// BOB_TEST_DATABASE_URL, like projection-reader.test.ts.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { boxRole } from './roles.ts'

const URL = process.env.BOB_TEST_DATABASE_URL
const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const USER_A = 'aaaaaaaa-1111-4000-8000-000000000001'
const skip = URL ? false : 'BOB_TEST_DATABASE_URL not set'
const pool = URL ? new pg.Pool({ connectionString: URL, max: 1 }) : null
after(() => pool?.end())

test('P-1: bob.users has no policy for bob_app, so an existing admin reads as viewer', { skip }, async () => {
  // The row exists (seen as the migration owner)...
  const { rows } = await pool!.query('SELECT role FROM bob.users WHERE id = $1', [USER_A])
  assert.equal(rows.length, 1)
  // ...but bob_app under the claim sees none, and the fallback is read-only.
  // When BOb-engine adds the policy this test fails, and P-1 is closed.
  assert.equal(await boxRole(TENANT_A, USER_A, pool!), 'viewer')
})

test('an unknown account is a viewer', { skip }, async () => {
  assert.equal(await boxRole(TENANT_A, '00000000-0000-4000-8000-000000000000', pool!), 'viewer')
})
