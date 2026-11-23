// The simulator renders stored configuration (channel labels, rule names,
// response subjects, peak windows, alert log entries) through innerHTML and
// into attribute values. Every such value must pass through the page's one
// encoder, `esc`, before it reaches markup (ASVS 4.0.3 V5.3.3).
//
// This is a static check over public/dashboard.html: inside each renderer of
// stored configuration, and the helpers they compose, every `${...}` that uses
// a stored field as a value must be an `esc(...)` call. A field used only as a
// condition (`r.name?'':'untitled'`, `w.days==='all'`) is not a sink.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const html = readFileSync('public/dashboard.html', 'utf8')

const CONFIG_RENDERER = /^(?:switchActTab|render\w*(?:Cfg\w*|Config\w*|Tab|Modal|KeywordRules|ABFields))$/
// Helpers the renderers compose; they write the same stored values.
const HELPERS = [
  '_webhookPicker', '_delRow', '_thHead', '_scopeChip', '_scopeSelect', '_anomRespCard',
  '_msgRow', '_autoBotzPicker', '_renderAutoBotz', '_abFormFields', '_renderResponsesSection',
  '_whoScopeRow', 'confirmRemoveCh', 'filterAlertModal',
]

// Stored or user-supplied values, by the names the renderers use for them.
const STORED = [
  /\b(?:ch|ab)\.(?:label|values|ref|provider)\b/,
  /\bverify\.msg\b/,
  /\b(?:r|resp|rule)\.(?:name|subject|message|payload|url|method|keywords|value|phrase|type|freqThresh|metric)\b/,
  /\bw\.(?:start|end)\b/,
  /\ba\.(?:mname|phrase|chPerf|notif|sev|time|val|thresh|position|title|desc)\b/,
  /\bo\.[lv]\b/,
  /\bab\[k\]/,
  /\bcfg\.(?:msg|actorId)\b/,
  /\bpinned\b/,
  /\btopEntry\[0\]/,
  /\bd\.metric\b/,
  /(?<![.\w])(?:name|displayVal)(?![\w:])/,
]
// A field followed by one of these is read as a condition or a lookup key,
// not written out.
const CONDITION = /^\s*(?:\?(?![.?])|===|!==|==|!=|&&|\]|\.length|\.includes|\.some|\.startsWith)/
// Calls whose result is markup the callee already encoded.
const SAFE_CALL = /^(?:esc|_delRow|_editBtns|_respChooser|_ncTypeIcon|_scopeChip|_autoBotzPicker|_abFormFields|_abFieldInputs|_thHead|_peakRow|_msgRow|_saveBtn|_whoScopeRow|_scopeSelect|_notifChips|_renderResponsesSection|_renderAutoBotz|_abAgo|abStateLabel|whoScopedTab|whoAlertsTab|patternInsight|buildChPerfSection|formatNum|tStr)\(/

function bodyOf(name: string): string {
  const start = html.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm'))
  assert.ok(start >= 0, `${name} is declared`)
  const end = html.indexOf('\n}', start)
  return html.slice(start, end + 2)
}

// Each `${...}` expression in the body. One that holds a nested template is
// skipped: its own `${...}` parts are found and checked on their own.
function interpolations(body: string): string[] {
  const out: string[] = []
  for (let at = body.indexOf('${'); at >= 0; at = body.indexOf('${', at + 2)) {
    let depth = 1, i = at + 2, quote = ''
    for (; i < body.length && depth; i++) {
      const c = body[i]
      if (quote) { if (c === '\\') i++; else if (c === quote) quote = ''; continue }
      if (c === '`') { depth = -1; break }
      if (c === "'" || c === '"') quote = c
      else if (c === '{') depth++
      else if (c === '}') depth--
    }
    if (depth === 0) out.push(body.slice(at + 2, i - 1).trim())
  }
  return out
}

function rawUse(expr: string): boolean {
  if (SAFE_CALL.test(expr)) return false
  return STORED.some((re) => {
    const g = new RegExp(re.source, 'g')
    for (let m = g.exec(expr); m; m = g.exec(expr)) {
      if (/esc\([\w.]*$/.test(expr.slice(0, m.index))) continue
      if (!CONDITION.test(expr.slice(m.index + m[0].length))) return true
    }
    return false
  })
}

const declared = [...html.matchAll(/^(?:async )?function (\w+)/gm)].map((m) => m[1])
const renderers = declared.filter((n) => CONFIG_RENDERER.test(n))

test('the page declares one encoder', () => {
  assert.ok(/^function esc\(s\)\{/m.test(html), 'function esc(s){ is declared at top level')
  const encode = new Function(`${bodyOf('esc')}; return esc`)() as (s: unknown) => string
  assert.equal(encode(`<b>x</b>"'&`), '&lt;b&gt;x&lt;/b&gt;&quot;&#39;&amp;')
  assert.equal(encode(null), '')
  assert.equal(encode(undefined), '')
  assert.equal(encode(0), '0')
})

test('the pattern still finds the configuration renderers', () => {
  for (const n of ['renderChannelsCfg', 'renderThresholdsCfg', 'renderAnomaliesCfg', 'renderTextRulesCfg', 'renderAlarmsTab', 'renderActionsTab']) {
    assert.ok(renderers.includes(n), n)
  }
})

test('every stored value a renderer writes goes through esc', () => {
  const raw: string[] = []
  for (const name of [...renderers, ...HELPERS]) {
    for (const expr of interpolations(bodyOf(name))) {
      if (rawUse(expr)) raw.push(`${name}: \${${expr}}`)
    }
  }
  assert.deepEqual(raw, [])
})

test('helpers that take a label encode it themselves', () => {
  assert.match(bodyOf('_delRow'), /<b>\$\{esc\(label\)\}<\/b>/)
  assert.match(bodyOf('_thHead'), /\$\{esc\(summary/)
  assert.match(bodyOf('_scopeChip'), /\$\{esc\(_scopeLabel\(sc\)\)\}/)
  assert.doesNotMatch(bodyOf('_abFormFields'), /\$\{v\}/)
})
