// The simulator's live painter (public/bob-live.mjs, P-4): the pure part. The
// rule is the one the /bob pages keep (contract §5): a figure with no row is
// never painted as 0, and a figure no projection carries says so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  cellText, durationText, failureText, liveMode, screenQuery, sentimentBars,
} from '../../public/bob-live.mjs'

test('a cell paints as what it is: no row, a written zero, or a value', () => {
  assert.deepEqual(cellText({ kind: 'no_row' }), { text: 'sin fila', cls: 'bob-norow' })
  assert.deepEqual(cellText({ kind: 'zero', rows: 3, open: 0 }), { text: '0', cls: 'bob-zero' })
  assert.deepEqual(cellText({ kind: 'value', value: 12, rows: 3, open: 1, pct: null }), { text: '12', cls: '' })
  const ms = cellText({ kind: 'value', value: 90_000, rows: 1, open: 0, pct: null }, durationText)
  assert.equal(ms.text, '1.5 min')
})

test('durations read in seconds under a minute and in minutes above', () => {
  assert.equal(durationText(4_200), '4 s')
  assert.equal(durationText(60_000), '1.0 min')
  assert.equal(durationText(754_000), '12.6 min')
})

test('the simulator\'s window maps onto range, with the viewer\'s offset', () => {
  assert.equal(screenQuery({ value: 'ahora' }, 300), 'range=now&tz=300')
  assert.equal(screenQuery({ value: 'hoy' }, -60), 'range=today&tz=-60')
  assert.equal(screenQuery({ value: 'semana' }, 0), 'range=week&tz=0')
  assert.equal(screenQuery({ value: 'mes' }, 300), 'range=month&tz=300')
  const custom = screenQuery({ value: 'custom', from: new Date('2026-11-01T05:00:00Z'), to: new Date('2026-11-02T04:59:00Z') }, 300)
  assert.equal(custom, 'from=2026-11-01T05%3A00%3A00.000Z&to=2026-11-02T04%3A59%3A00.000Z')
  // A custom window with no dates falls back to now, not to an invented range.
  assert.equal(screenQuery({ value: 'custom' }, 300), 'range=now&tz=300')
})

test('mood bars: counts per state on one scale, never summed, no row has no bar', () => {
  const v = (value: number) => ({ kind: 'value', value, rows: 1, open: 0, pct: null }) as const
  const orga = { s0: v(2), s1: { kind: 'zero', rows: 1, open: 0 }, s2: v(8), s3: { kind: 'no_row' }, s4: v(4) }
  const meca = { s0: { kind: 'no_row' }, s1: { kind: 'no_row' }, s2: { kind: 'no_row' }, s3: { kind: 'no_row' }, s4: { kind: 'no_row' } }
  const bars = sentimentBars(orga, meca)
  assert.equal(bars.length, 5)
  assert.deepEqual(bars.map((b) => b.orga.ratio), [0.25, 0, 1, null, 0.5])
  assert.deepEqual(bars.map((b) => b.orga.text), ['2', '0', '8', 'sin fila', '4'])
  assert.ok(bars.every((b) => b.meca.ratio === null && b.meca.text === 'sin fila'))
})

test('only a 404 or a non-JSON answer means the demo: anything else is the box speaking', () => {
  assert.equal(liveMode(404, true), false)
  // Outside the box with no session the proxy redirects to /login (status 0 with redirect: 'manual').
  assert.equal(liveMode(0, false), false)
  assert.equal(liveMode(200, false), false)
  for (const s of [200, 400, 401, 403, 500, 503]) assert.equal(liveMode(s, true), true, String(s))
})

test('a failed read says why, and never falls back to invented figures', () => {
  assert.match(failureText(403, 'Forbidden'), /Sin acceso/)
  assert.match(failureText(503, 'Identity unavailable'), /no disponible/)
  assert.match(failureText(400, 'ventana demasiado larga (máximo 31 días)'), /31 días/)
  assert.match(failureText(500, 'Read failed'), /No se pudo leer/)
})
