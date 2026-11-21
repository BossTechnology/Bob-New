// The matrix builder keeps contract §5: no row is not a zero.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  buildMatrix, cellOf, countRow, durationRow, MATRIX_ROWS,
  type Channel, type CountAggregate,
} from './matrix.ts'

const ch = (name: string, capabilities: string[], idle: number | null = null): Channel =>
  ({ id: name, name, type: 'chat', lag_seconds: 60, idle_bound_seconds: idle, capabilities })
const spec = (id: string) => MATRIX_ROWS.find((r) => r.id === id)!

test('a cell with no projection row is no_row, never zero', () => {
  assert.deepEqual(cellOf(0, 0, 0, null), { kind: 'no_row' })
  const m = buildMatrix([], [], [ch('A', ['resolution'])])
  for (const row of m.rows) {
    assert.equal(row.total.kind, 'no_row', `${row.spec.id} total`)
    for (const a of m.actors) assert.equal(row.cells[a].kind, 'no_row', `${row.spec.id} ${a}`)
  }
})

test('rows that sum to zero are zero, and keep how many rows there were', () => {
  const agg: CountAggregate[] = [{ key: 'abstained', actor_type: 'user', rows: 2, value: 0, open: 1 }]
  const m = buildMatrix(agg, [], [ch('A', ['orga_conversation'])])
  const abstained = m.labelFailures.find((r) => r.spec.id === 'abstained')!
  assert.deepEqual(abstained.cells.user, { kind: 'zero', rows: 2, open: 1 })
  assert.equal(abstained.cells.asa.kind, 'no_row')
})

test('one actor with rows does not turn the other actors into zeros', () => {
  const agg: CountAggregate[] = [{ key: 'resolved', actor_type: 'human', rows: 1, value: 3, open: 0 }]
  const r = countRow(spec('resolved'), agg, [ch('A', ['resolution'])], ['user', 'asa', 'human'])
  assert.equal(r.cells.user.kind, 'no_row')
  assert.equal(r.cells.asa.kind, 'no_row')
  assert.deepEqual(r.cells.human, { kind: 'value', value: 3, rows: 1, open: 0, pct: 1 })
  assert.deepEqual(r.total, { kind: 'value', value: 3, rows: 1, open: 0, pct: null })
})

test('shares are over the actors that have rows', () => {
  const agg: CountAggregate[] = [
    { key: 'resolved', actor_type: 'asa', rows: 1, value: 1, open: 0 },
    { key: 'resolved', actor_type: 'human', rows: 2, value: 3, open: 0 },
  ]
  const r = countRow(spec('resolved'), agg, [], ['user', 'asa', 'human'])
  assert.equal(r.cells.asa.kind === 'value' && r.cells.asa.pct, 0.25)
  assert.equal(r.cells.human.kind === 'value' && r.cells.human.pct, 0.75)
})

test('not configured is about declarations, and is reported apart from the cells', () => {
  const channels = [ch('A', ['orga_conversation']), ch('B', [], 1800)]
  const m = buildMatrix([], [], channels)
  const row = (id: string) => m.rows.find((r) => r.spec.id === id)!
  assert.deepEqual(row('resolved').declaredBy, [])
  assert.deepEqual(row('abandoned').declaredBy, ['B'])
  assert.equal(row('escalations').declaredBy, null)
  assert.equal(row('resolved').cells.user.kind, 'no_row')
})

test('a response time with rows but n = 0 is zero; no rows is no_row', () => {
  const r = durationRow(spec('response_time'),
    [{ actor_type: 'asa', rows: 1, n: 0, sum_ms: 0, open: 0 }],
    [ch('A', ['response_time'])], ['user', 'asa', 'human'])
  assert.equal(r.cells.user.kind, 'no_row')
  assert.equal(r.cells.asa.kind, 'zero')
})

test('an arep column appears only when a row carries arep', () => {
  assert.deepEqual(buildMatrix([], [], []).actors, ['user', 'asa', 'human'])
  const m = buildMatrix([{ key: 'resolved', actor_type: 'arep', rows: 1, value: 1, open: 0 }], [], [])
  assert.deepEqual(m.actors, ['user', 'asa', 'human', 'arep'])
})
