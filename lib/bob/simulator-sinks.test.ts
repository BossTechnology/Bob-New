// The simulator writes values into innerHTML without escaping (a channel
// label, a rule name, a peak window). In the box none of those writers may
// run (ASVS 4.0.3 V5.3.3).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SIM_OFF } from '../../public/bob-live.mjs'

const html = readFileSync('public/dashboard.html', 'utf8')
// Every top-level function of the simulator that writes HTML with an
// interpolated value, found by what it does rather than by its name.
const lines = html.split('\n')
const starts = lines.flatMap((l, i) => {
  const m = l.match(/^(?:async )?function (\w+)/)
  return m ? [{ i, name: m[1] }] : []
})
const htmlWriters = starts.filter(({ i }, k) => {
  const body = lines.slice(i, starts[k + 1]?.i ?? lines.length).join('\n')
  return /innerHTML|outerHTML|insertAdjacentHTML/.test(body) && body.includes('${')
}).map(({ name }) => name)

test('every simulator function that writes interpolated HTML is off in the box', () => {
  assert.ok(htmlWriters.includes('renderChannelsCfg') && htmlWriters.includes('confirmRemoveCh')
    && htmlWriters.includes('filterAnomalyModal'), 'the discovery still finds them')
  assert.deepEqual(htmlWriters.filter((n) => !SIM_OFF.includes(n)), [])
})

// If bob-live never starts (its own request fails, a 503 from GoTrue), the
// page must stay closed: no stored configuration loaded, nothing shown.
test('the simulator loads stored configuration only when bob-live says it is the demo', () => {
  assert.doesNotMatch(html, /setTimeout\([^)]*hydrate/)
  assert.match(html, /addEventListener\('bob:demo',\s*function\(\)\{\s*hydrate\(\)/)
  const tag = html.match(/<script type="module" src="\/bob-live\.mjs"[^>]*>/)?.[0] ?? ''
  assert.ok(tag, 'the painter is loaded')
  assert.doesNotMatch(tag, /bob-pending/, 'a failed painter does not reveal the simulator')
})
