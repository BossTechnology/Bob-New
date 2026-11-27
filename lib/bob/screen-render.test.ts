// The three /bob pages, rendered as they ship (app/bob/*/page.tsx), once as a
// viewer and once as admin (review of PR #66). Only the gate and the reads are
// stubs (render-pages.ts); the role goes through the page as it does in the box.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { pageUrl, registerPageHooks } from './render-pages.ts'
import type { Channel } from './matrix.ts'
import type { CellState } from './cell-state.ts'

registerPageHooks()

const ORG = '00000000-0000-4000-8000-000000000000'
// The pages read the box's organization from the environment (runtime.ts).
process.env.BOB_ORG_ID = ORG
const CH = '11111111-1111-4111-8111-111111111111'
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i

const channel: Channel = {
  id: CH, name: 'Canal Demo', type: 'whatsapp', lag_seconds: null, idle_bound_seconds: null, capabilities: ['resolution'],
}
const cell = (metric: string, actor: string | null, state: CellState['state'], reasons: string[]): CellState =>
  ({ metric, actor_type: actor, state, reasons, value: null, provisional: false, coverage: { n: 0, m: 1, excluded: [] } })

// Slice 3 present, with cells in the states that carry technical reasons.
const CELLS: CellState[] = [
  cell('resolved', 'user', 'not_configured', ['capability_not_declared:resolution']),
  cell('abandoned', 'user', 'pending', ['not_sealed', 'lag_not_declared']),
  cell('escalations', 'user', 'not_observed', ['no_liveness']),
  cell('interaction_duration', null, 'not_configured', ['source_key_unset']),
  cell('sentiment_orga', null, 'not_configured', ['capability_not_declared:orga_conversation']),
  cell('abstained', 'user', 'not_applicable', ['actor_not_present']),
]

const READ = {
  orgId: ORG,
  channels: [channel],
  selected: [channel],
  window: { from: new Date('2026-11-27T13:00:00Z'), to: new Date('2026-11-27T14:00:00Z'), channelIds: [CH] },
  watermark: new Date('2026-11-27T13:55:00Z'),
  counts: [{ key: 'resolved', actor_type: 'human', rows: 2, value: 5, open: 1 }],
  responseTimes: [],
  presence: [{ table: 'proj_metric_counts', channel_id: CH, rows: 2, open: 1 }],
  durations: [{ channel_id: CH, rows: 1, n: 2, sum_ms: 240_000, open: 0 }],
  sentiment: [{ source: 'orga', state: 's2', rows: 1, readings: 3, closings: 1, open: 0 }],
  cells: CELLS,
}

type Page = (p: { searchParams: Promise<Record<string, string>> }) => Promise<ReactElement>
const g = globalThis as { __bobGate?: unknown; __bobRead?: unknown }

async function render(screen: string, role: string): Promise<string> {
  g.__bobGate = { role }
  g.__bobRead = READ
  const { default: page } = await import(pageUrl(screen)) as { default: Page }
  const el = await page({ searchParams: Promise.resolve({}) })
  return renderToStaticMarkup(createElement(() => el))
}

// The channel picker's links carry the channel's id and the window: they are
// how the screen navigates, and the channel is the viewer's own organization's.
const withoutHrefs = (html: string) => html.replace(/ href="[^"]*"/g, '')

const VIEWER_NEVER: [string, RegExp][] = [
  ['un uuid', UUID], ['proj_', /proj_/], ['watermark', /watermark/i], ['lag_seconds', /lag_seconds/],
  ['capacidad', /capacidad/i], ['contrato', /contrato/i], ['Slice', /slice/i], ['Capacidades', /Capacidades/],
  ['un instante ISO', /\d{4}-\d\d-\d\dT\d\d:/], ['no aplica', /no aplica/i], ['s0–s4', />s[0-4]</],
  ['sin fila', /sin fila/i], ['sin proyección', /sin proyecci/i], ['bucket', /bucket/i],
]

const TECHNICAL: Record<string, RegExp[]> = {
  performance: [UUID, /proj_metric_counts/, /watermark/, /lag_seconds/, /capacidad resolution/, /contrato/, /Slice 3/, /Capacidades/],
  interactions: [/proj_durations/, /watermark/, /lag_seconds/, /capacidad resolution/, /contrato/, /Slice 3/],
  quality: [/proj_sentiment/, /proj_metric_counts/, /Slice 3/, /no aplica/, />s0</],
}

for (const screen of ['performance', 'interactions', 'quality']) {
  test(`${screen} as a viewer: no jargon`, async () => {
    const html = await render(screen, 'viewer')
    // The screen itself, not its error page.
    assert.match(html, /Periodo: /, `${screen}: the screen did not render`)
    assert.match(html, /Canal Demo/)
    assert.ok(!html.includes(ORG), `${screen}: the organization's id reaches a viewer`)
    const seen = withoutHrefs(html)
    for (const [name, re] of VIEWER_NEVER) assert.doesNotMatch(seen, re, `${screen}: ${name} visible to a viewer`)
  })

  test(`${screen} as admin: the technical version`, async () => {
    const html = await render(screen, 'admin')
    assert.match(html, /ventana <code>/, `${screen}: the screen did not render`)
    for (const re of TECHNICAL[screen]) assert.match(html, re, `${screen}: ${re} missing for admin`)
  })
}

test('the figures are the same for a viewer and for admin', async () => {
  // Performance's two technical tables (declarations, presence) are admin only.
  // The legends show sample figures; they are words, not data.
  const shared = (html: string) => html.split('>Canales seleccionados<')[0].replace(/<p class="legend">.*?<\/p>/g, '')
  const figures = (html: string) => [...withoutHrefs(shared(html)).matchAll(/>(\d+(?:\.\d+)?(?: s| min| resp\.)?)</g)].map((m) => m[1])
  for (const screen of ['performance', 'interactions', 'quality']) {
    assert.deepEqual(figures(await render(screen, 'viewer')), figures(await render(screen, 'admin')), screen)
  }
})
