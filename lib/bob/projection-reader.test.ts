// The read layer against a BOb-engine local stack, as bob_app under a claim.
//
// Needs BOB_TEST_DATABASE_URL pointing at a local stack where BOb-engine's
// two-tenant fixture is loaded and the reference feeder has run over
// feeder_events.json (window 2026-11-18 14:00–14:30). Skipped otherwise.
// It reads; it writes nothing.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import { UnknownChannelError, asBobApp, readPerformance } from './projection-reader.ts'
import { buildMatrix } from './matrix.ts'

const URL = process.env.BOB_TEST_DATABASE_URL
const TENANT_A = 'aaaaaaaa-0000-4000-8000-000000000001'
const TENANT_B = 'bbbbbbbb-0000-4000-8000-000000000002'
const WHATSAPP_A = 'aaaaaaaa-2222-4000-8000-000000000001'
const WEBSITE_A = 'aaaaaaaa-2222-4000-8000-00000000000b'
const WINDOW = { from: '2026-11-18T14:00:00Z', to: '2026-11-18T14:30:00Z' }
const skip = URL ? false : 'BOB_TEST_DATABASE_URL not set'
const pool = URL ? new pg.Pool({ connectionString: URL, max: 2 }) : null
after(() => pool?.end())

test('reads run as bob_app with the org claim set', { skip }, async () => {
  const who = await asBobApp(TENANT_A, async (db) => (await db.query(
    "SELECT current_user AS u, current_setting('request.jwt.claims')::json ->> 'org_id' AS org")).rows[0], pool!)
  assert.deepEqual(who, { u: 'bob_app', org: TENANT_A })
})

test('a metric with no projection row reads as no_row, not 0', { skip }, async () => {
  const read = await readPerformance(TENANT_A, { ...WINDOW, channel: WHATSAPP_A }, pool!)
  assert.ok(read.counts.length > 0, 'the fixture was not projected')
  assert.equal(read.counts.some((c) => c.key === 'abandoned'), false)
  const m = buildMatrix(read.counts, read.responseTimes, read.selected)
  const abandoned = m.rows.find((r) => r.spec.id === 'abandoned')!
  assert.equal(abandoned.total.kind, 'no_row')
  for (const a of m.actors) assert.equal(abandoned.cells[a].kind, 'no_row')
  // The feeder did write zeros on this channel: they must stay zeros.
  const abstained = m.labelFailures.find((r) => r.spec.id === 'abstained')!
  assert.equal(abstained.cells.user.kind, 'value')
  const missing = read.counts.find((c) => c.key === 'label_missing' && c.actor_type === 'user')!
  assert.ok(missing.rows > 1)
})

test('proj_durations has no row, and response time is no_row for every actor', { skip }, async () => {
  const read = await readPerformance(TENANT_A, WINDOW, pool!)
  assert.deepEqual(read.responseTimes, [])
  const m = buildMatrix(read.counts, read.responseTimes, read.selected)
  const rt = m.rows.find((r) => r.spec.id === 'response_time')!
  for (const a of m.actors) assert.equal(rt.cells[a].kind, 'no_row')
})

test('the claim scopes the read: tenant B sees none of tenant A', { skip }, async () => {
  const b = await readPerformance(TENANT_B, WINDOW, pool!)
  assert.ok(b.channels.length > 0)
  assert.equal(b.channels.some((c) => c.id.startsWith('aaaaaaaa')), false)
  assert.equal(b.presence.some((p) => p.channel_id?.startsWith('aaaaaaaa')), false)
})

test('rows the feeder wrote as zeros read as zero, not no_row', { skip }, async () => {
  // Website, 14:20: abstained and classifier_down written with event_count 0.
  const read = await readPerformance(TENANT_A, { ...WINDOW, channel: WEBSITE_A }, pool!)
  const m = buildMatrix(read.counts, read.responseTimes, read.selected)
  for (const id of ['abstained', 'classifier_down']) {
    const row = m.labelFailures.find((r) => r.spec.id === id)!
    assert.equal(row.cells.user.kind, 'zero', id)
    assert.equal(row.total.kind, 'zero', id)
  }
  // label_missing was never written there (lag NULL never seals): no_row.
  assert.equal(m.labelFailures.find((r) => r.spec.id === 'label_missing')!.cells.user.kind, 'no_row')
})

test('an unknown channel is refused, not read as an empty selection', { skip }, async () => {
  await assert.rejects(
    readPerformance(TENANT_A, { ...WINDOW, channel: 'bbbbbbbb-2222-4000-8000-00000000000c' }, pool!),
    UnknownChannelError)
})
