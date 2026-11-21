// Slice 3 states as bob-web receives them: attached, never decided here.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { reasonSummary, reasonText, stateForChannel, stateOf, type CellState } from './cell-state.ts'
import { buildMatrix, totalState, type Channel } from './matrix.ts'
import { buildInteractions, buildQuality } from './screens.ts'

const CH: Channel[] = [
  { id: 'c1', name: 'WhatsApp', type: 'whatsapp', lag_seconds: 0, idle_bound_seconds: null, capabilities: ['resolution'] },
  { id: 'c2', name: 'Voice', type: 'voice', lag_seconds: 900, idle_bound_seconds: null, capabilities: [] },
]
const cov = (n: number, m: number, excluded: CellState['coverage']['excluded'] = []) => ({ n, m, excluded })
const cell = (metric: string, actor: string | null, state: CellState['state'], reasons: string[] = [],
  value: number | null = null, coverage = cov(0, 2)): CellState =>
  ({ metric, actor_type: actor, state, reasons, value, provisional: false, coverage })

test('without the rollup, cells carry no state and paint as before', () => {
  const m = buildMatrix([], [], CH, null)
  const abandoned = m.rows.find((r) => r.spec.id === 'abandoned')!
  assert.equal(abandoned.cells.user.kind, 'no_row')
  assert.equal(abandoned.cells.user.state, undefined)
})

test('a no-row cell takes the state the database resolved, not a 0', () => {
  const cells = [
    cell('abandoned', 'user', 'not_configured', ['idle_bound_not_declared']),
    cell('abandoned', 'asa', 'not_configured', ['idle_bound_not_declared']),
    cell('abandoned', 'human', 'not_configured', ['idle_bound_not_declared']),
  ]
  const m = buildMatrix([], [], CH, cells)
  const row = m.rows.find((r) => r.spec.id === 'abandoned')!
  assert.equal(row.cells.user.kind, 'no_row')
  assert.equal(row.cells.user.state?.state, 'not_configured')
  assert.deepEqual(row.cells.asa.state?.reasons, ['idle_bound_not_declared'])
  assert.equal(row.total.state?.state, 'not_configured')
})

test('the row total is observed if any actor is, and ignores not_applicable', () => {
  const t = totalState([
    { state: 'not_applicable', reasons: [], provisional: false, coverage: cov(0, 2), value: null },
    { state: 'not_observed', reasons: ['no_liveness'], provisional: false, coverage: cov(0, 2), value: null },
    { state: 'observed', reasons: [], provisional: true, coverage: cov(1, 2), value: 3 },
  ])
  assert.equal(t?.state, 'observed')
  assert.equal(t?.value, 3)
  assert.equal(t?.provisional, true)
  const none = totalState([
    { state: 'not_applicable', reasons: [], provisional: false, coverage: cov(0, 2), value: null },
    { state: 'not_observed', reasons: ['no_liveness'], provisional: false, coverage: cov(0, 2), value: null },
    { state: 'pending', reasons: ['not_sealed'], provisional: false, coverage: cov(0, 2), value: null },
  ])
  assert.equal(none?.state, 'pending')
})

test('Response quality gets its state even though no projection carries it', () => {
  const m = buildMatrix([], [], CH, [cell('response_quality', 'user', 'not_configured', ['no_definition:D-15'])])
  const q = m.rows.find((r) => r.spec.id === 'quality')!
  assert.equal(q.cells.user.state?.state, 'not_configured')
})

test('interaction duration per channel: excluded channels carry their own state', () => {
  const st = cell('interaction_duration', 'user', 'observed', [], 4, cov(1, 2, [
    { channel_id: 'c2', state: 'not_configured', reasons: ['capability_not_declared:resolution'] },
  ]))
  const s = buildInteractions([{ channel_id: 'c1', rows: 2, n: 4, sum_ms: 8000, open: 0 }], CH, [st])
  assert.equal(s.avgDuration.state?.state, 'observed')
  const voice = s.byChannel.find((b) => b.channel.id === 'c2')!
  assert.equal(voice.avgDuration.state?.state, 'not_configured')
  assert.equal(s.byChannel.find((b) => b.channel.id === 'c1')!.avgDuration.state?.state, 'observed')
  assert.equal(stateForChannel(stateOf([st], 'interaction_duration', 'user'), 'c2')?.reasons[0],
    'capability_not_declared:resolution')
})

test('sentiment panels take the channel-level state (actor_type null)', () => {
  const q = buildQuality([], [], CH, [
    cell('orga', null, 'not_observed', ['no_liveness']),
    cell('meca', null, 'not_configured', ['capability_not_declared:meca_rum']),
  ])
  assert.equal(q.orga.total.state?.state, 'not_observed')
  assert.equal(q.meca.states.s2.state?.state, 'not_configured')
})

test('reasons become sentences, the first one plus how many more', () => {
  assert.match(reasonText('capability_not_declared:resolution'), /resolución/)
  assert.match(reasonText('no_definition:D-15'), /D-15/)
  assert.equal(reasonText('something_new'), 'something_new')
  assert.match(reasonSummary(['telemetry_not_started', 'source_key_unset']), /\(y 1 más\)$/)
})
