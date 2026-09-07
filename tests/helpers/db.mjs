// Test-suite database helpers.
//
// Connects to the Supabase CLI local stack (D-23 / Q10). The tenancy tests must
// run against the policies we actually ship, and a plain Postgres container has
// no auth.jwt(), no `authenticated` role and no supabase_auth_admin — it would
// test a reconstruction of the policies rather than the policies.

import pg from 'pg'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'

const HERE = dirname(fileURLToPath(import.meta.url))
export const REPO_ROOT = resolve(HERE, '..', '..')

const CONNECTION =
  process.env.SUPABASE_DB_URL ||
  'postgresql://postgres:postgres@127.0.0.1:54322/postgres'

export const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001'
export const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002'
export const USER_A = 'aaaaaaaa-1111-4000-8000-000000000001'

export async function connect() {
  const client = new pg.Client({ connectionString: CONNECTION })
  await client.connect()

  // Every test file loads fixtures into the SAME database, and fixture loading
  // deletes before it inserts. Run two files at once and they deadlock — and
  // node's runner reports the casualties as `cancelledByParent`, which does not
  // increment the failure count. The suite then reads green while a third of it
  // never ran, which is the exact failure ID-12 exists to prevent.
  //
  // The npm scripts pass --test-concurrency=1. This lock is the second layer,
  // so that someone changing that flag later gets a slow suite rather than a
  // dishonest one. Session-scoped: released when the connection closes.
  await client.query('SELECT pg_advisory_lock(hashtext($1))', ['bob-test-fixtures'])
  return client
}

// Load the two-tenant fixture. Idempotent across runs within one suite: the
// suite owns the database and resets it before starting.
export async function loadFixture(client) {
  const sql = readFileSync(
    resolve(REPO_ROOT, 'supabase/tests/fixtures/two_orgs.sql'),
    'utf8',
  )
  await client.query('BEGIN')
  await client.query(`
    DELETE FROM actor_shifts         WHERE org_id IN ($1, $2);
    DELETE FROM actor_channel_skills WHERE org_id IN ($1, $2);
    DELETE FROM actors               WHERE org_id IN ($1, $2);
    DELETE FROM channel_actor_mix    WHERE org_id IN ($1, $2);
    DELETE FROM notification_channels WHERE org_id IN ($1, $2);
    DELETE FROM autobotz             WHERE org_id IN ($1, $2);
    DELETE FROM channels             WHERE org_id IN ($1, $2);
    DELETE FROM users                WHERE org_id IN ($1, $2);
    DELETE FROM organizations        WHERE id     IN ($1, $2);
  `.replace(/\$1/g, `'${TENANT_A}'`).replace(/\$2/g, `'${TENANT_B}'`))
  await client.query(sql)
  await client.query('COMMIT')
}

// The Slice 1 roster. Separate from the two-tenant fixture because the tenancy
// suite must keep running against the smallest possible fixture — a leak is
// easier to see in five rows than in eighty.
export async function loadRoster(client) {
  const sql = readFileSync(
    resolve(REPO_ROOT, 'supabase/tests/fixtures/roster.sql'),
    'utf8',
  )
  await client.query('BEGIN')
  await client.query(sql)
  await client.query('COMMIT')
}

// Run a function as `authenticated` carrying a tenant's JWT claims, exactly the
// way PostgREST does. Always rolled back: a tenancy test must not be able to
// leave state behind that a later tenancy test then reads.
export async function asTenant(client, orgId, fn) {
  await client.query('BEGIN')
  try {
    const claims = JSON.stringify({
      org_id: orgId,
      sub: USER_A,
      role: 'authenticated',
      app_role: 'admin',
    })
    await client.query('SELECT set_config($1, $2, true)', [
      'request.jwt.claims',
      claims,
    ])
    await client.query('SET LOCAL ROLE authenticated')
    return await fn()
  } finally {
    await client.query('ROLLBACK')
  }
}

// Every table in `public` that carries an org_id. Discovered, never listed:
// a table added later without RLS must fail this suite without anyone
// remembering to extend an array.
export async function tenantTables(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS table_name,
           c.relrowsecurity  AS rls_enabled,
           c.relforcerowsecurity AS rls_forced,
           (SELECT count(*)::int FROM pg_policies p
             WHERE p.schemaname = 'public' AND p.tablename = c.relname) AS policy_count
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
     WHERE n.nspname = 'public'
       AND c.relkind = 'r'
       AND EXISTS (
         SELECT 1 FROM information_schema.columns ic
          WHERE ic.table_schema = 'public'
            AND ic.table_name = c.relname
            AND ic.column_name = 'org_id')
     ORDER BY c.relname`)
  return rows
}
