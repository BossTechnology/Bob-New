// The simulator's live painter (public/bob-live.mjs, P-4): the pure part. The
// rule is the one the /bob pages keep (contract §5): a figure with no row is
// never painted as 0, and a figure no projection carries says so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  THRESHOLD_TARGETS, cellText, durationText, failureText, liveMode, saveFailureText, screenQuery,
  sentimentBars, thresholdBody,
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

// Thresholds in the box: only for figures bob paints, under the simulator's
// own keys (threshold_configs "maps to metricCfg[mid]", BOb-engine
// 20260729130000). Nothing here evaluates a threshold: that is Slice 5's.
test('only the figures bob paints take a threshold, under the simulator\'s keys', () => {
  assert.deepEqual(Object.keys(THRESHOLD_TARGETS).sort(), ['aba', 'alu', 'avgtime', 'der', 'des', 'res'])
  assert.equal(THRESHOLD_TARGETS.res.row, 'resolved')
  assert.equal(THRESHOLD_TARGETS.avgtime.unit, 'min')
  for (const none of ['sessions', 'nps', 'quality', 'sentiment', 'temas', 'acciones', 'faq', 'words']) {
    assert.equal((THRESHOLD_TARGETS as Record<string, unknown>)[none], undefined, none)
  }
})

test('a threshold body keeps peak settings and refuses what is not a bound', () => {
  const current = { peak_mode: 'manual', peak_windows: [{ from: '09:00', to: '11:00' }] }
  assert.deepEqual(thresholdBody({ upper: '12', lower: '' }, current), {
    ok: true, body: { upper_bound: 12, lower_bound: null, peak_mode: 'manual', peak_windows: current.peak_windows },
  })
  assert.deepEqual(thresholdBody({ upper: '', lower: ' 2.5 ' }, null), {
    ok: true, body: { upper_bound: null, lower_bound: 2.5, peak_mode: 'off', peak_windows: [] },
  })
  // Both empty clears the bounds, which is a valid save.
  assert.equal(thresholdBody({ upper: '', lower: '' }, null).ok, true)
  assert.match(thresholdBody({ upper: 'abc', lower: '' }, null).error ?? '', /número/)
  assert.match(thresholdBody({ upper: '-1', lower: '' }, null).error ?? '', /negativ/)
  assert.match(thresholdBody({ upper: '5', lower: '9' }, null).error ?? '', /inferior/)
})

test('a refused save says why', () => {
  assert.match(saveFailureText(403), /papel/)
  assert.match(saveFailureText(400, 'Invalid peak_mode'), /Invalid peak_mode/)
  assert.match(saveFailureText(503), /no disponible/)
})

test('observed with no row is a plain 0, never a zero-length time', () => {
  // For durations the rollup's value is the sample count n (F-32), not ms.
  const state = { state: 'observed', reasons: ['actor_not_present'], provisional: false, value: 0 }
  const asTime = (ms: number) => `${(ms / 1000).toFixed(1)} s`
  assert.equal(cellText({ kind: 'no_row', state }, asTime).text, '0')
  assert.equal(cellText({ kind: 'no_row', state: { ...state, value: null } }, asTime).text, '0')
})

// The page fails closed: the simulator (and its stored configuration) runs
// only when the server says, in JSON, that it is not a box.
test('only a server that says it is not a box gets the demo', async () => {
  const { pageMode } = await import('../../public/bob-live.mjs')
  const bob = { status: 200, json: true }
  const notBob = { status: 404, json: true }
  const html = { status: 502, json: false }
  const redirect = { status: 0, json: false }
  const demoHealth = { json: true, body: { status: 'ok', db: 'ok', version: '1.0.0' } }
  const boxHealth = { json: true, body: { status: 'down', db: 'ok', identity: 'error', version: '1.0.0' } }
  assert.equal(pageMode(bob, null), 'box')
  assert.equal(pageMode(notBob, demoHealth), 'demo')
  assert.equal(pageMode(redirect, demoHealth), 'demo')
  // A gateway page or a redirect from the gate in front of a box: not the demo.
  assert.equal(pageMode(html, boxHealth), 'closed')
  assert.equal(pageMode(redirect, boxHealth), 'closed')
  assert.equal(pageMode(html, { json: false, body: null }), 'closed')
  assert.equal(pageMode(html, null), 'closed')
  assert.equal(pageMode(notBob, { json: true, body: null }), 'closed')
})
