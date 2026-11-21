// The read layer against a BOb-engine local stack, as bob_app under a claim.
//
// Needs BOB_TEST_DATABASE_URL pointing at a local stack where BOb-engine's
// two-tenant fixture is loaded and the reference feeder has run over
// feeder_events.json (window 2026-11-18 14:00–14:30). Skipped otherwise.
// It reads; it writes nothing.
import { test, after } from 'node:test'
import assert from 'node:assert/strict'
import pg from 'pg'
import {
  MAX_WINDOW_MS, UnknownChannelError, asBobApp, readInteractions, readPerformance, readQuality, resolveWindow,
} from './projection-reader.ts'
import { buildMatrix } from './matrix.ts'
import { buildInteractions, buildQuality } from './screens.ts'

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

test('Interactions: no interaction_duration row reads as no_row, not 0', { skip }, async () => {
  const read = await readInteractions(TENANT_A, WINDOW, pool!)
  assert.deepEqual(read.durations, [])
  const s = buildInteractions(read.durations, read.selected)
  assert.equal(s.avgDuration.kind, 'no_row')
  assert.equal(s.closed.kind, 'no_row')
  for (const c of s.byChannel) assert.equal(c.avgDuration.kind, 'no_row')
  assert.equal(s.sessions.kind, 'not_projection')
  assert.equal(read.channels.length, 3)
})

test('Quality: ORGA reads its rows by state; MECA has none and is no_row', { skip }, async () => {
  const read = await readQuality(TENANT_A, WINDOW, pool!)
  const q = buildQuality(read.sentiment, read.counts, read.selected)
  assert.equal(q.orga.total.kind, 'value')
  assert.ok(q.orga.total.kind === 'value' && q.orga.total.value >= 2)
  assert.equal(q.orga.states.s0.kind, 'no_row')
  assert.equal(q.meca.total.kind, 'no_row')
  for (const st of ['s0', 's1', 's2', 's3', 's4'] as const) assert.equal(q.meca.states[st].kind, 'no_row')
  assert.deepEqual(q.meca.declaredBy, [])
  assert.equal(q.nps.kind, 'not_projection')
})

test('Quality: the written label-failure zeros stay zeros', { skip }, async () => {
  const read = await readQuality(TENANT_A, { ...WINDOW, channel: WEBSITE_A }, pool!)
  const q = buildQuality(read.sentiment, read.counts, read.selected)
  const kinds = Object.fromEntries(q.labelFailures.map((r) => [r.spec.id, r.cells.user.kind]))
  assert.deepEqual(kinds, { abstained: 'zero', classifier_down: 'zero', label_missing: 'no_row' })
})

test('Quality: the claim scopes sentiment to the tenant', { skip }, async () => {
  const a = await readQuality(TENANT_A, WINDOW, pool!)
  const b = await readQuality(TENANT_B, WINDOW, pool!)
  assert.equal(b.sentiment.some((s) => s.state === 's1'), false)
  assert.equal(a.sentiment.some((s) => s.state === 's4'), false)
})

test('the Slice 3 view is looked for, not assumed', { skip }, async () => {
  const read = await readInteractions(TENANT_A, WINDOW, pool!)
  assert.equal(typeof read.cellStateView, 'boolean')
})

test('writes as bob_app are refused under a read transaction and allowed under a write one', { skip }, async () => {
  await assert.rejects(asBobApp(TENANT_A, (db) => db.query(
    "UPDATE bob.threshold_configs SET peak_mode = peak_mode WHERE false"), pool!))
  await asBobApp(TENANT_A, (db) => db.query(
    "UPDATE bob.threshold_configs SET peak_mode = peak_mode WHERE false"), pool!, { write: true })
})

test('an unknown channel is refused, not read as an empty selection', { skip }, async () => {
  await assert.rejects(
    readPerformance(TENANT_A, { ...WINDOW, channel: 'bbbbbbbb-2222-4000-8000-00000000000c' }, pool!),
    UnknownChannelError)
})

test('the window is capped: a request cannot read back to 1970', () => {
  const wm = new Date('2026-11-18T14:30:00Z')
  assert.throws(() => resolveWindow({ from: '1970-01-01' }, wm), /ventana/)
  assert.throws(() => resolveWindow({ from: '2026-01-01T00:00:00Z', to: '2026-11-18T00:00:00Z' }, wm), /ventana/)
  const w = resolveWindow({ from: '2026-11-01T00:00:00Z', to: '2026-11-18T00:00:00Z' }, wm)
  assert.ok(w.to.getTime() - w.from.getTime() <= MAX_WINDOW_MS)
  // The default (24 h before the watermark) is well inside the cap.
  const d = resolveWindow({}, wm)
  assert.equal(d.to.getTime() - d.from.getTime(), 24 * 3600_000)
})

// The simulator's four buttons (P-4). Each ends at the watermark's bucket; the
// start is local to the viewer, whose offset arrives as `tz` in minutes, the
// sign of Date.getTimezoneOffset() (Bogotá is +300).
test('range=now is the last bucket up to the watermark', () => {
  const wm = new Date('2026-11-18T14:32:00Z')
  const w = resolveWindow({ range: 'now' }, wm)
  assert.equal(w.to.toISOString(), '2026-11-18T14:35:00.000Z')
  assert.equal(w.from.toISOString(), '2026-11-18T14:30:00.000Z')
})

test('range=today, week and month start at the viewer\'s local midnight', () => {
  const wm = new Date('2026-11-18T14:32:00Z') // Wed 18 Nov, 09:32 in Bogotá
  const tz = '300'
  assert.equal(resolveWindow({ range: 'today', tz }, wm).from.toISOString(), '2026-11-18T05:00:00.000Z')
  // Weeks start on Sunday, as the simulator's own label does.
  assert.equal(resolveWindow({ range: 'week', tz }, wm).from.toISOString(), '2026-11-15T05:00:00.000Z')
  assert.equal(resolveWindow({ range: 'month', tz }, wm).from.toISOString(), '2026-11-01T05:00:00.000Z')
  // Without tz the day is UTC's.
  assert.equal(resolveWindow({ range: 'today' }, wm).from.toISOString(), '2026-11-18T00:00:00.000Z')
})

test('range uses the day the watermark falls in, even right after a local midnight', () => {
  // 05:00Z is exactly midnight in Bogotá: the window is the bucket that ends there, not empty.
  const wm = new Date('2026-11-18T05:00:00Z')
  const w = resolveWindow({ range: 'today', tz: '300' }, wm)
  assert.equal(w.to.toISOString(), '2026-11-18T05:00:00.000Z')
  assert.equal(w.from.toISOString(), '2026-11-17T05:00:00.000Z')
})

test('an unknown range or offset is refused, and from/to win over range', () => {
  const wm = new Date('2026-11-18T14:32:00Z')
  assert.throws(() => resolveWindow({ range: 'year' }, wm), /ventana/)
  assert.throws(() => resolveWindow({ range: 'today', tz: 'x' }, wm), /ventana/)
  assert.throws(() => resolveWindow({ range: 'today', tz: '9999' }, wm), /ventana/)
  const w = resolveWindow({ range: 'month', from: '2026-11-17T00:00:00Z', to: '2026-11-18T00:00:00Z' }, wm)
  assert.equal(w.from.toISOString(), '2026-11-17T00:00:00.000Z')
})
