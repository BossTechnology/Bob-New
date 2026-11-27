// The three /bob screens rendered as a viewer and as admin (Henry, 2026-11-27,
// «oculta la jerga a los viewers para el lunes»). A viewer reads the client's
// words: no organization id, no table or column, no capability, no contract,
// no Slice. Admin and analyst keep the technical view.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { register } from 'node:module'
import { createElement, type ComponentType } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import type { Audience } from './audience.ts'
import { audienceFor } from './audience.ts'
import type { Channel } from './matrix.ts'
import type { CellState } from './cell-state.ts'
import type { InteractionsRead, PerformanceRead, QualityRead } from './projection-reader.ts'

register('./test-support/tsx-hooks.mjs', import.meta.url)
const { PerformanceView } = await import('../../app/bob/performance/performance-view.tsx')
const { InteractionsView } = await import('../../app/bob/interactions/interactions-view.tsx')
const { QualityView } = await import('../../app/bob/quality/quality-view.tsx')

// Obviously fake ids: the repo is public.
const ORG = '00000000-0000-4000-8000-0000000000aa'
const WA: Channel = {
  id: '00000000-0000-4000-8000-000000000001', name: 'WhatsApp Demo', type: 'whatsapp',
  lag_seconds: null, idle_bound_seconds: null, capabilities: [],
}
const window = { from: new Date('2026-11-20T00:00:00Z'), to: new Date('2026-11-27T00:00:00Z'), channelIds: [WA.id] }
const scope = { orgId: ORG, channels: [WA], selected: [WA], window, watermark: null }

// A rollup cell whose reasons name channel fields and a capability.
const notConfigured: CellState = {
  metric: 'resolved', actor_type: 'user', state: 'not_configured', value: null, provisional: true,
  reasons: ['capability_not_declared:resolution', 'source_key_unset'],
  coverage: { n: 0, m: 1, excluded: [] },
}

// Empty (what Febor starts with), and with Slice 3 states, open buckets and figures.
const empty = {
  performance: { ...scope, counts: [], responseTimes: [], presence: [], cells: null } as PerformanceRead,
  interactions: { ...scope, durations: [], cells: null } as InteractionsRead,
  quality: { ...scope, sentiment: [], counts: [], cells: null } as QualityRead,
}
const busy = {
  performance: {
    ...scope, watermark: new Date('2026-11-26T12:00:00Z'), cells: [notConfigured],
    counts: [{ key: 'escalations', actor_type: 'user', rows: 3, value: 2, open: 1 },
      { key: 'abstained', actor_type: 'user', rows: 1, value: 0, open: 0 }],
    responseTimes: [{ actor_type: 'asa', rows: 2, n: 4, sum_ms: 8000, open: 1 }],
    presence: [{ table: 'proj_metric_counts', channel_id: WA.id, rows: 4, open: 1 }],
  } as PerformanceRead,
  interactions: {
    ...scope, cells: [notConfigured],
    durations: [{ channel_id: WA.id, rows: 2, n: 3, sum_ms: 360_000, open: 1 }],
  } as InteractionsRead,
  quality: {
    ...scope, cells: [notConfigured],
    sentiment: [{ source: 'orga', state: 's2', rows: 1, readings: 5, closings: 2, open: 1 }],
    counts: [{ key: 'label_missing', actor_type: 'user', rows: 1, value: 1, open: 0 }],
  } as QualityRead,
}

type Screen = 'performance' | 'interactions' | 'quality'
const VIEWS = { performance: PerformanceView, interactions: InteractionsView, quality: QualityView } as
  Record<Screen, ComponentType<{ read: unknown; audience: Audience; channel?: string }>>

// What a person can read on the page: text, tooltips and labels. A link's
// href carries the channel id to work, and nobody reads it there.
function rendered(screen: Screen, read: unknown, audience: Audience): string {
  const html = renderToStaticMarkup(createElement(VIEWS[screen], { read, audience }))
  return html.replace(/\shref="[^"]*"/g, '')
}

const JARGON: [string, RegExp][] = [
  ['uuid', /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i],
  ['proj_', /proj_/i], ['watermark', /watermark/i], ['capacidad', /capacidad/i],
  ['contrato', /contrato/i], ['Slice', /slice/i], ['bob_', /bob_/i], ['bucket', /bucket/i],
  ['lag_seconds', /lag_seconds/i], ['idle_bound', /idle_bound/i], ['source_key', /source_key/i],
]

for (const [name, data] of Object.entries({ empty, busy })) {
  for (const screen of ['performance', 'interactions', 'quality'] as Screen[]) {
    test(`${screen} as a viewer (${name}): no developer text`, () => {
      const html = rendered(screen, data[screen], audienceFor('viewer'))
      for (const [label, re] of JARGON) assert.doesNotMatch(html, re, `${screen} shows «${label}» to a viewer`)
      assert.match(html, /Del .+ al .+/, 'the window is a readable date')
    })
  }
}

test('a viewer reads «Sin datos para este canal» where no channel declares what a figure needs', () => {
  for (const screen of ['performance', 'interactions', 'quality'] as Screen[]) {
    assert.match(rendered(screen, empty[screen], 'client'), /Sin datos para este canal/)
  }
  assert.match(rendered('performance', empty.performance, 'client'), /Turnos sin clasificar/)
})

for (const role of ['admin', 'analyst', null] as const) {
  test(`${role ?? 'outside the box'}: the technical view is unchanged`, () => {
    const audience = audienceFor(role)
    assert.equal(audience, 'technical')
    const perf = rendered('performance', busy.performance, audience)
    assert.ok(perf.includes(ORG), 'the org id')
    for (const s of ['watermark', 'proyecciones reales (bob_app)', 'proj_metric_counts', 'capacidad response_time',
      'el contrato no nombra capacidad', 'Las ocho proyecciones', 'lag_seconds', 'filas sin sellar']) {
      assert.ok(perf.includes(s), `performance keeps «${s}»`)
    }
    assert.match(rendered('performance', empty.performance, audience), /Estados del Slice 3 pendientes/)
    assert.match(perf, /source_key/, 'a state keeps its reasons in the tooltip')
    const inter = rendered('interactions', busy.interactions, audience)
    for (const s of ['proj_durations · interaction_duration', 'capacidad resolution', 'el contrato 0.5.3', 'lag_seconds']) {
      assert.ok(inter.includes(s), `interactions keeps «${s}»`)
    }
    const qual = rendered('quality', busy.quality, audience)
    for (const s of ['proj_sentiment', 'orga_conversation: no configurado en la selección', 'buckets sin sellar']) {
      assert.ok(qual.includes(s), `quality keeps «${s}»`)
    }
  })
}

test('the figures are the same for both audiences', () => {
  // The technical view's two extra tables (channels, presence) have no viewer counterpart.
  const figures = (html: string) =>
    (html.split('Canales seleccionados')[0].match(/>\d[\d.]*( s| min)?</g) ?? []).join(' ')
  for (const screen of ['performance', 'interactions', 'quality'] as Screen[]) {
    const client = figures(rendered(screen, busy[screen], 'client'))
    assert.ok(client.length > 0)
    assert.equal(client, figures(rendered(screen, busy[screen], 'technical')))
  }
})
