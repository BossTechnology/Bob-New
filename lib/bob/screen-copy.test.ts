// What the three /bob screens say to a viewer and to admin/analyst.
// Henry, 2026-11-27: «oculta la jerga a los viewers para el lunes».
//
// screenText() puts together every word a screen paints, through the same
// functions the pages call (app/bob/*/page.tsx paint nothing else of their
// own), over cells in every state and rows both declared and not.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  audienceFor, declared, formatWindow, interactionsLegend, labelFailuresTitle, paintCell, paintNoProjection,
  paintNoTable, performanceLegend, qualityLegend, readError, rowSource, screenTitle, sentimentTitle,
  showsTechnicalTables, sliceThreeNote, techNote, technicalMeta,
  type Audience, type LegendItem, type Note, type Paint, type Screen,
} from './screen-copy.ts'
import { buildMatrix, type Cell, type Channel } from './matrix.ts'
import { buildInteractions, buildQuality } from './screens.ts'
import type { StateInfo } from './cell-state.ts'

const ORG = '00000000-0000-4000-8000-000000000000'
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i
const FROM = new Date('2026-11-27T10:00:00Z')
const TO = new Date('2026-11-27T11:00:00Z')

const ch = (id: string, capabilities: string[], idle: number | null = null): Channel =>
  ({ id, name: `Canal ${id}`, type: 'chat', lag_seconds: null, idle_bound_seconds: idle, capabilities })

const info = (state: StateInfo['state'], reasons: string[], value: number | null = null): StateInfo =>
  ({ state, reasons, value, provisional: true, coverage: { n: 1, m: 2, excluded: [{ channel_id: 'b', state, reasons }] } })

// A cell in every way the screens can paint one.
const CELLS: Cell[] = [
  { kind: 'no_row' },
  { kind: 'zero', rows: 2, open: 1 },
  { kind: 'value', value: 7, rows: 3, open: 2, pct: 0.5 },
  { kind: 'no_row', state: info('not_applicable', ['actor_not_present']) },
  { kind: 'no_row', state: info('not_configured', ['capability_not_declared:resolution', 'idle_bound_not_declared']) },
  { kind: 'no_row', state: info('not_configured', ['source_key_unset', 'mix_not_declared']) },
  { kind: 'no_row', state: info('pending', ['not_sealed', 'lag_not_declared']) },
  { kind: 'no_row', state: info('not_observed', ['no_liveness', 'telemetry_not_started']) },
  { kind: 'no_row', state: { ...info('observed', ['actor_not_present'], 0), provisional: false } },
  { kind: 'value', value: 4, rows: 1, open: 0, pct: 1, state: info('observed', ['none_observed']) },
]

const paintText = (p: Paint) => [p.text, p.title, p.label, p.open, p.share]
const noteText = (n: Note | null) => (n ? [n.text] : [])
const legendText = (items: LegendItem[] | null) => (items ?? []).flatMap((i) => [i.sample?.text, i.text])

// Every word of one screen, for one audience.
function screenText(screen: Screen, a: Audience, channels: Channel[]): string[] {
  const out: (string | undefined)[] = [screenTitle(screen, a)]
  out.push(...(a === 'viewer'
    ? [formatWindow(FROM, TO, 'UTC')]
    : technicalMeta({ from: FROM, to: TO }, { orgId: screen === 'performance' ? ORG : undefined, watermark: TO })
      .flatMap((m) => [m.label, m.value])))
  for (const c of CELLS) {
    out.push(...paintText(paintCell(c, a)), ...paintText(paintCell(c, a, { unit: ' resp.' })))
    out.push(...paintText(paintCell(c, a, { pct: true, format: (v) => `${v} s` })))
  }
  const err = readError(screen, a, 'BOB_ORG_ID no es un uuid; proj_metric_counts no existe')
  out.push(err.label, err.message)
  out.push(...legendText(sliceThreeNote(a, true)), ...legendText(sliceThreeNote(a, false)))
  const n = channels.length
  if (screen === 'performance') {
    const m = buildMatrix([], [], channels)
    for (const r of [...m.rows, ...m.labelFailures]) out.push(...noteText(rowSource(r, a, n)))
    out.push(...paintText(paintNoTable(a)), labelFailuresTitle(a), ...legendText(performanceLegend(a)))
    if (showsTechnicalTables(a)) out.push('Canales seleccionados', 'lag_seconds', 'idle_bound_seconds', 'Capacidades', 'proj_durations')
  }
  if (screen === 'interactions') {
    const s = buildInteractions([], channels)
    out.push(...noteText(techNote(s.sessions.note, a)), ...paintText(paintNoProjection(s.sessions, a)))
    out.push(...noteText(techNote('proj_durations · interaction_duration (sum_ms / n)', a)))
    out.push(...noteText(declared('capacidad resolution', s.durationDeclaredBy, a, n)))
    out.push(...noteText(techNote('n de interaction_duration', a)), ...legendText(interactionsLegend(a)))
  }
  if (screen === 'quality') {
    const s = buildQuality([], [], channels)
    out.push(...noteText(techNote(s.nps.note, a)), ...paintText(paintNoProjection(s.nps, a)))
    out.push(sentimentTitle(a), labelFailuresTitle(a), ...legendText(qualityLegend(a)))
    for (const p of [s.orga, s.meca]) {
      out.push(...noteText(declared(p.source === 'orga' ? 'orga_conversation' : 'meca_rum', p.declaredBy, a, n)))
    }
  }
  return out.filter((x): x is string => typeof x === 'string')
}

const SCREENS: Screen[] = ['performance', 'interactions', 'quality']
// No channel declares anything, then one that declares everything: both the
// red warnings and the gray "declared by" lines are painted.
const SELECTIONS = [[ch('a', [])], [ch('a', ['resolution', 'orga_conversation', 'meca_rum', 'response_time', 'hallucination'], 1800), ch('b', [])]]
const JARGON: [string, RegExp][] = [
  ['un uuid', UUID], ['proj_', /proj_/i], ['watermark', /watermark/i], ['capacidad', /capacidad/i],
  ['contrato', /contrato/i], ['Slice', /slice/i], ['bob_', /bob_/i], ['_seconds', /_seconds/i],
  ['sin fila', /sin fila/i], ['bucket', /bucket/i], ['proyecci', /proyecci/i], ['source_key', /source_key/i],
]

test('a viewer reads no uuid, table, capability, contract, watermark or Slice on any screen', () => {
  for (const screen of SCREENS) {
    for (const channels of SELECTIONS) {
      const text = screenText(screen, 'viewer', channels).join('\n')
      for (const [name, re] of JARGON) assert.doesNotMatch(text, re, `${screen}: ${name} visible to a viewer`)
    }
  }
})

test('admin and analyst still read the technical version', () => {
  for (const role of ['admin', 'analyst']) {
    const a = audienceFor(role)
    assert.equal(a, 'technical')
    const perf = SELECTIONS.flatMap((c) => screenText('performance', a, c)).join('\n')
    assert.match(perf, UUID)
    for (const re of [/proj_metric_counts/, /watermark/, /capacidad resolution/, /el contrato no nombra capacidad/, /Slice 3/, /sin fila/]) {
      assert.match(perf, re)
    }
    assert.match(SELECTIONS.flatMap((c) => screenText('interactions', a, c)).join('\n'), /proj_durations · interaction_duration/)
    assert.match(SELECTIONS.flatMap((c) => screenText('quality', a, c)).join('\n'), /proj_sentiment/)
    assert.ok(showsTechnicalTables(a))
  }
})

test('only admin and analyst are technical; viewer, no role and unknown roles read as viewer', () => {
  assert.equal(audienceFor('viewer'), 'viewer')
  for (const r of [null, undefined, '', 'demo', 'service', 'Admin']) assert.equal(audienceFor(r), 'viewer', String(r))
  assert.equal(showsTechnicalTables('viewer'), false)
})

test('the viewer red warning is short and says whether one channel or several', () => {
  const m = buildMatrix([], [], [ch('a', [])])
  const resolved = m.rows.find((r) => r.spec.id === 'resolved')!
  assert.deepEqual(rowSource(resolved, 'viewer', 1), { tone: 'notConfigured', text: 'Sin datos para este canal' })
  assert.deepEqual(rowSource(resolved, 'viewer', 3), { tone: 'notConfigured', text: 'Sin datos para estos canales' })
  assert.equal(rowSource(m.rows.find((r) => r.spec.id === 'escalations')!, 'viewer', 1), null)
})

test('only the words change: the viewer keeps every figure, zero and provisional mark', () => {
  for (const c of CELLS) {
    const v = paintCell(c, 'viewer', { unit: ' resp.' })
    const t = paintCell(c, 'technical', { unit: ' resp.' })
    assert.equal(v.tone, t.tone)
    assert.equal(Boolean(v.open), Boolean(t.open))
    if (t.tone === 'value' || t.tone === 'zero') assert.equal(v.text, t.text)
  }
  // No row is never a zero, for the viewer too.
  assert.equal(paintCell({ kind: 'no_row' }, 'viewer').text, '—')
})

test('the window reads as a date and time, not as ISO instants', () => {
  const s = formatWindow(FROM, TO, 'UTC')
  assert.doesNotMatch(s, /T\d\d:|Z\b|\.000/)
  assert.match(s, /10:00/)
  assert.match(s, /11:00/)
  assert.match(formatWindow(FROM, TO, 'America/Bogota'), /5:00/)
})
