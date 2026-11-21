// The /api/config tables, read and written as bob_app under a claim.
//
// The SQL tests are pure. The live ones need BOB_TEST_DATABASE_URL (see
// projection-reader.test.ts); they write rows for fixture tenant A under a
// metric id of their own and delete them at the end.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { TableQuery, bobTables } from './tables.ts'

const URL = process.env.BOB_TEST_DATABASE_URL
const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const METRIC = 'bob_web_tables_test'
const skip = URL ? false : 'BOB_TEST_DATABASE_URL not set'
const pool = URL ? new pg.Pool({ connectionString: URL, max: 2 }) : null
after(async () => {
  if (pool) await bobTables(TENANT_A, pool).from('threshold_configs').delete().eq('metric_id', METRIC)
  await pool?.end()
})

const q = (t: string) => new TableQuery(t, TENANT_A)

test('a select compiles to one parameterised statement on schema bob', () => {
  const s = q('threshold_configs').select('id, metric_id').eq('org_id', TENANT_A).order('metric_id').compile()
  assert.equal(s.text,
    'SELECT "id", "metric_id" FROM bob."threshold_configs" WHERE "org_id" = $1 ORDER BY "metric_id" ASC')
  assert.deepEqual(s.values, [TENANT_A])
})

test('an upsert updates every column outside the conflict target', () => {
  const s = q('threshold_configs')
    .upsert({ org_id: TENANT_A, metric_id: 'm', peak_windows: [{ a: 1 }] }, { onConflict: 'org_id,metric_id' })
    .select('id').compile()
  assert.match(s.text, /ON CONFLICT \("org_id", "metric_id"\) DO UPDATE SET "peak_windows" = EXCLUDED\."peak_windows" RETURNING "id"$/)
  assert.equal(s.values[2], '[{"a":1}]', 'jsonb goes as JSON, not as a Postgres array')
})

test('contains compiles to the array operator', () => {
  const s = q('response_rules').select('id, channel_ids').contains('channel_ids', ['c1']).compile()
  assert.equal(s.text, 'SELECT "id", "channel_ids" FROM bob."response_rules" WHERE "channel_ids" @> $1')
})

test('tables and columns outside the allowlist are refused', () => {
  assert.throws(() => q('alerts').select('*').compile(), /not reachable/)
  assert.throws(() => q('interactions').select('*').compile(), /not reachable/)
  assert.throws(() => q('response_rules').insert({ webhook_url: 'x' }).compile(), /webhook_url is not reachable/)
  assert.throws(() => q('users').select('*').compile(), /not reachable/)
  assert.throws(() => q('threshold_configs').select('id, organizations(name)'), /unsupported select/)
})

test('a refused query comes back as an Error with its code, not a plain object', async () => {
  // Routes do `if (error) throw error`; a plain object reached the client as
  // "[object Object]" (review of PR #30, point 5).
  const r = await q('alerts').select('*')
  assert.ok(r.error instanceof Error)
  assert.equal(r.error.code, 'BOB_QUERY')
})

test('an update or a delete with no filter is refused', () => {
  assert.throws(() => q('text_rules').update({ name: 'x' }).compile(), /needs a filter/)
  assert.throws(() => q('text_rules').delete().compile(), /needs a filter/)
})

test('a threshold round-trips through bob as bob_app', { skip }, async () => {
  const t = bobTables(TENANT_A, pool!)
  const row = { org_id: TENANT_A, metric_id: METRIC, upper_bound: 5, lower_bound: null, peak_mode: 'off',
    peak_windows: [{ from: '09:00', to: '11:00' }] }
  const up = await t.from('threshold_configs').upsert(row, { onConflict: 'org_id,metric_id' })
    .select('id, metric_id, upper_bound, peak_windows').single()
  assert.equal(up.error, null)
  // numeric comes back as a JSON number, as PostgREST gives it to the
  // simulator outside the box (pg alone would give the string "5").
  assert.strictEqual(up.data.upper_bound, 5)
  assert.deepEqual(up.data.peak_windows, [{ from: '09:00', to: '11:00' }])
  const again = await t.from('threshold_configs').upsert({ ...row, upper_bound: 7 }, { onConflict: 'org_id,metric_id' })
    .select('id, upper_bound').single()
  assert.equal(again.data.id, up.data.id)
  assert.strictEqual(again.data.upper_bound, 7)
  const none = await t.from('threshold_configs').select('lower_bound').eq('metric_id', METRIC).single()
  assert.strictEqual(none.data.lower_bound, null)

  const got = await t.from('threshold_configs').select('id').eq('org_id', TENANT_A).eq('metric_id', METRIC).maybeSingle()
  assert.equal(got.data.id, up.data.id)
})

test('the claim scopes writes and reads: tenant B neither sees nor touches A', { skip }, async () => {
  const b = bobTables(TENANT_B, pool!)
  // No org_id filter at all: RLS alone must hide A's row.
  const seen = await b.from('threshold_configs').select('id, org_id').eq('metric_id', METRIC)
  assert.equal(seen.error, null)
  assert.deepEqual(seen.data, [])
  const gone = await b.from('threshold_configs').delete().eq('metric_id', METRIC).select('id')
  assert.deepEqual(gone.data, [])
  // Writing a row for A under B's claim is refused by the policy.
  const forged = await b.from('threshold_configs').insert({ org_id: TENANT_A, metric_id: METRIC + '_x' }).select('id')
  assert.ok(forged.error, 'a row for another tenant was written')
})

test('single on no row is an error; maybeSingle is null', { skip }, async () => {
  const t = bobTables(TENANT_A, pool!)
  const none = '00000000-0000-4000-8000-000000000000'
  assert.equal((await t.from('text_rules').select('id').eq('id', none).single()).error?.code, 'PGRST116')
  assert.deepEqual(await t.from('text_rules').select('id').eq('id', none).maybeSingle(), { data: null, error: null })
})

test('an action response without an AutoBotz binding is refused by bob (Slice 6)', { skip }, async () => {
  const t = bobTables(TENANT_A, pool!)
  const r = await t.from('response_rules').insert({ org_id: TENANT_A, type: 'action', name: 'x' }).select('id')
  assert.equal(r.error?.code, '23514')
})
