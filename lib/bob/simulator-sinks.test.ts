// In the box none of the simulator's HTML writers run: the box has its own
// threshold editor and needs none of them (ASVS 4.0.3 V5.3.3). This does not
// rely on them encoding what they write; that is checked separately, for the
// demo, by simulator-encoding.test.ts.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SIM_OFF } from '../../public/bob-live.mjs'

const html = readFileSync('public/dashboard.html', 'utf8')

// The top-level functions of a script that write HTML built from values,
// found by what they do rather than by their name: a template with ${},
// a concatenation, or a call to a helper that returns such HTML. Nested
// functions and arrows count as part of the function that holds them.
function discover(src: string) {
  const lines = src.split('\n')
  const starts = lines.flatMap((l, i) => {
    const m = l.match(/^(?:async\s+)?function\s+(\w+)|^(?:const|let|var)\s+(\w+)\s*=\s*(?:async\s*)?(?:function\b|\([^)]*\)\s*=>|\w+\s*=>)/)
    return m ? [{ i, name: m[1] ?? m[2], declared: Boolean(m[1]) }] : []
  })
  const fns = starts.map((f, k) => ({ ...f, body: lines.slice(f.i, starts[k + 1]?.i ?? lines.length).join('\n') }))
  const SINK = /(?:innerHTML|outerHTML)\s*\+?=|insertAdjacentHTML\s*\(/
  const built = (b: string) => b.includes('${') || /['"`]\s*\+\s*[\w(]|[\w)\]]\s*\+\s*['"`]/.test(b)
  const helpers = fns.filter((f) => !SINK.test(f.body) && /return\s*[`'"]\s*</.test(f.body) && built(f.body)).map((f) => f.name)
  const usesHelper = (b: string) => helpers.some((h) => new RegExp(`\\b${h}\\(`).test(b))
  const writers = fns.filter((f) => SINK.test(f.body) && (built(f.body) || usesHelper(f.body)))
  return {
    writers: writers.map((f) => f.name),
    // SIM_OFF replaces window properties; a const or let binding is not one.
    undeclared: writers.filter((f) => !f.declared).map((f) => f.name),
  }
}

test('the discovery sees templates, concatenation, HTML helpers and arrows', () => {
  const src = [
    "function a(x){ el.innerHTML=`<b>${x}</b>` }",
    "function b(x){ el.innerHTML='<b>'+x+'</b>' }",
    "function row(x){ return `<li>${x}</li>` }",
    "function c(x){ el.innerHTML=row(x) }",
    "function d(){ const f=(x)=>{ el.insertAdjacentHTML('beforeend', '<i>'+x) }; f(1) }",
    "const e=(x)=>{ el.innerHTML=`${x}` }",
    "function fixed(){ el.innerHTML='<hr>' }",
  ].join('\n')
  assert.deepEqual(discover(src), { writers: ['a', 'b', 'c', 'd', 'e'], undeclared: ['e'] })
})

const found = discover(html)

test('every simulator function that writes interpolated HTML is off in the box', () => {
  for (const n of ['renderChannelsCfg', 'confirmRemoveCh', 'filterAnomalyModal', 'filterGenericModal', 'renderEntityActivity']) {
    assert.ok(found.writers.includes(n), `the discovery still finds ${n}`)
  }
  assert.deepEqual(found.undeclared, [], 'a writer the box can turn off is a function declaration')
  assert.deepEqual(found.writers.filter((n) => !SIM_OFF.includes(n)), [])
})

// If bob-live never starts (its own request fails, a 503 from GoTrue), the
// page must stay closed: no stored configuration loaded, nothing shown.
test('the simulator loads stored configuration only when bob-live says it is the demo', () => {
  assert.doesNotMatch(html, /setTimeout\([^)]*hydrate/)
  assert.match(html, /addEventListener\('bob:demo',\s*function\(\)\{[^}]*hydrate\(\)/)
  const tag = html.match(/<script type="module" src="\/bob-live\.mjs"[^>]*>/)?.[0] ?? ''
  assert.ok(tag, 'the painter is loaded')
  assert.doesNotMatch(tag, /bob-pending/, 'a failed painter does not reveal the simulator')
})

// The Actionables panel sits outside <main> and BObee can open it even when
// bob-live never started; it must not read stored rules then either.
test('the panel loads stored rules only after bob-live says it is the demo', () => {
  const wrapper = html.match(/renderConfigTab=function\(metricId\)\{[\s\S]*?\n  \};/)?.[0] ?? ''
  assert.ok(wrapper.includes('Bridge.loadAnomalyRules'), 'the wrapper is found')
  assert.match(wrapper, /if\(!_bobDemo\)\s*return _renderConfigTab/, 'nothing is loaded before the signal')
  const sets = html.match(/_bobDemo\s*=\s*true/g) ?? []
  assert.equal(sets.length, 1)
  assert.match(html, /addEventListener\('bob:demo',\s*function\(\)\{\s*_bobDemo\s*=\s*true;/)
})
