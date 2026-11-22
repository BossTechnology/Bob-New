// The simulator writes stored configuration into innerHTML without escaping
// (a channel label, a rule name, a peak window). In the box none of those
// renderers may run (ASVS 4.0.3 V5.3.3; docs/asvs-l2-box.md).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { SIM_OFF } from '../../public/bob-live.mjs'

const html = readFileSync('public/dashboard.html', 'utf8')
const declared = [...html.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1])
const CONFIG_RENDERER = /^(?:switchActTab|render\w*(?:Cfg\w*|Config\w*|Tab|Modal|KeywordRules|ABFields))$/

test('every renderer of stored configuration is off in the box', () => {
  const renderers = declared.filter((n) => CONFIG_RENDERER.test(n))
  assert.ok(renderers.includes('renderChannelsCfg') && renderers.includes('renderConfigTab'), 'the pattern still finds them')
  assert.deepEqual(renderers.filter((n) => !SIM_OFF.includes(n)), [])
})
