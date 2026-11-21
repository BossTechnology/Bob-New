// Interactions and Quality, built from projection aggregates. Pure.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildInteractions, buildQuality, SENTIMENT_STATES } from './screens.ts'
import type { Channel } from './matrix.ts'

const ch = (id: string, capabilities: string[]): Channel => ({
  id, name: id, type: 'whatsapp', lag_seconds: 0, idle_bound_seconds: null, capabilities,
})
const WA = ch('wa', ['orga_conversation', 'resolution'])
const VOICE = ch('voice', ['resolution'])

test('interaction duration with no projection row is no_row, never 0', () => {
  const s = buildInteractions([], [WA])
  assert.equal(s.avgDuration.kind, 'no_row')
  assert.deepEqual(s.byChannel.map((c) => c.avgDuration.kind), ['no_row'])
})

test('interaction duration is sum_ms / n, per channel and in total', () => {
  const s = buildInteractions([
    { channel_id: 'wa', rows: 2, n: 4, sum_ms: 400_000, open: 1 },
    { channel_id: 'voice', rows: 1, n: 1, sum_ms: 100_000, open: 0 },
  ], [WA, VOICE])
  assert.deepEqual(s.avgDuration, { kind: 'value', value: 100_000, rows: 3, open: 1, pct: null })
  assert.equal(s.closed.kind === 'value' && s.closed.value, 5)
  assert.equal(s.byChannel.find((c) => c.channel.id === 'wa')!.avgDuration.kind, 'value')
})

test('a written n = 0 is an observed zero, not no_row', () => {
  const s = buildInteractions([{ channel_id: 'wa', rows: 1, n: 0, sum_ms: 0, open: 0 }], [WA])
  assert.equal(s.avgDuration.kind, 'zero')
  assert.equal(s.closed.kind, 'zero')
})

test('sessions have no projection behind them, even with closed conversations in the window', () => {
  // Henry, 2026-11-21 (P-2): «Sesiones» stays «sin proyección» until the
  // contract names it. The n of interaction_duration is not a session count.
  assert.equal(buildInteractions([], [WA]).sessions.kind, 'not_projection')
  const s = buildInteractions([{ channel_id: 'wa', rows: 1, n: 12, sum_ms: 60000, open: 0 }], [WA])
  assert.equal(s.sessions.kind, 'not_projection')
})

test('interaction duration says which selected channels declare a close', () => {
  assert.deepEqual(buildInteractions([], [WA, ch('web', [])]).durationDeclaredBy, ['wa'])
})

test('a sentiment source with no rows is no_row, and its states are not zeros', () => {
  const q = buildQuality([], [], [WA])
  assert.equal(q.orga.total.kind, 'no_row')
  for (const st of SENTIMENT_STATES) assert.equal(q.orga.states[st].kind, 'no_row')
  assert.equal(q.meca.total.kind, 'no_row')
})

test('ORGA and MECA are counted apart, by state, never blended', () => {
  const q = buildQuality([
    { source: 'orga', state: 's1', rows: 1, readings: 3, closings: 1, open: 0 },
    { source: 'orga', state: 's3', rows: 2, readings: 1, closings: 0, open: 1 },
    { source: 'meca', state: 's2', rows: 1, readings: 5, closings: 0, open: 0 },
  ], [], [WA])
  assert.equal(q.orga.total.kind === 'value' && q.orga.total.value, 4)
  assert.equal(q.orga.states.s1.kind === 'value' && q.orga.states.s1.pct, 0.75)
  // A state with no row is no_row even when the source has rows.
  assert.equal(q.orga.states.s0.kind, 'no_row')
  assert.equal(q.meca.total.kind === 'value' && q.meca.total.value, 5)
  assert.equal(q.orga.closings.kind === 'value' && q.orga.closings.value, 1)
})

test('MECA is not configured on a selection that declares no meca_rum', () => {
  const q = buildQuality([], [], [WA, VOICE])
  assert.deepEqual(q.meca.declaredBy, [])
  assert.deepEqual(q.orga.declaredBy, ['wa'])
})

test('NPS has no projection behind it', () => {
  assert.equal(buildQuality([], [], [WA]).nps.kind, 'not_projection')
})

test('label failures come from proj_metric_counts with their written zeros', () => {
  const q = buildQuality([], [
    { key: 'abstained', actor_type: 'user', rows: 2, value: 0, open: 0 },
    { key: 'classifier_down', actor_type: 'user', rows: 1, value: 2, open: 0 },
  ], [WA])
  const by = Object.fromEntries(q.labelFailures.map((r) => [r.spec.id, r.cells.user.kind]))
  assert.deepEqual(by, { abstained: 'zero', classifier_down: 'value', label_missing: 'no_row' })
})
