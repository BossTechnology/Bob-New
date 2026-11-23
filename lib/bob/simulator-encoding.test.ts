// The simulator renders stored configuration (channel labels, rule names,
// response subjects, peak windows, the alert log) through innerHTML and into
// attribute values. Every value must pass through the page's one encoder,
// `esc`, before it reaches markup (ASVS 4.0.3 V5.3.3).
//
// This test discovers its sinks instead of listing them. It reads
// public/dashboard.html, starts from the configuration renderers, follows every
// page function whose markup reaches them, and finds every `${...}` inside an
// HTML template in those functions. Each value written there must be one of:
//   - esc(...);
//   - markup from a page function that builds HTML (checked the same way);
//   - a local whose every assignment is itself one of these;
//   - a literal, a number (an index, a count, arithmetic on numbers);
//   - one of the few names in SAFE below, each with its reason.
// Anything else fails, whatever it is called.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const PAGE = 'public/dashboard.html'
const CONFIG_RENDERER = /^(?:switchActTab|render\w*(?:Cfg\w*|Config\w*|Tab|Modal|KeywordRules|ABFields))$/

// Values written into markup without esc. Each is either markup the page
// itself defines, or an identifier placed in an attribute (an element id or an
// inline handler argument), where esc would not help: the browser decodes
// entities before the handler runs. Identifiers are kept to [\w-] instead:
// internal ones by construction, stored ones by validation where they load.
const SAFE: Record<string, string> = {
  'n.svg': 'icon markup from the NOTIF_DEFS constant',
  'def?.svg': 'channel icon markup from the CH_LIBRARY constant',
  mid: 'metric id from the page metric list or a who_ entity key',
  metricId: 'metric id, as mid',
  key: 'threshold key from _thKey: a metric id, plus an actor id it validates',
  sid: 'sentiment slot id, s0..s4',
  sec: 'threshold panel section name, a constant',
  sev: 'severity name, critical or warning',
  k: 'column key or AutoBotz field key, from constants',
  path: 'response path built from constants and indexes',
  storeKey: 'metric id, as mid',
  extraKey: 'item key from the page, as mid',
  'ch.id': 'channel id: a local counter or a server id validated in loadChannels',
  'c.id': 'channel id from activeChannels, a CH_LIBRARY constant',
  'n.id': 'notification type from the NOTIF_DEFS constant',
  'ab.id': 'AutoBotz id: a local counter or a client_id validated in loadAutoBotz',
  'tc.id': 'text rule condition id from the TEXT_RULE_CONDITIONS constant',
  'o.key': 'threshold option key from _getThresholdOptions constants',
  'p.id': 'AutoBotz provider id from the AB_PROVIDERS constant',
  id: 'element id: a channel id (as ch.id) or a page constant',
  rkey: 'delete key built from mid and an index',
  ruleIdx: 'rule index passed by the caller',
  ri: 'response index passed by the caller',
  uses: 'reference count passed by the caller',
  dkey: 'delete key built from ab.id',
  saveFn: 'handler code: callers build it from the identifiers above',
  cancelFn: 'handler code, as saveFn',
  confirmFn: 'handler code, as saveFn',
  fn: 'handler code, as saveFn',
  "onPick.replace('__T__','alert')": 'handler code, as saveFn',
  "onPick.replace('__T__','alarm')": 'handler code, as saveFn',
  "onPick.replace('__T__','action')": 'handler code, as saveFn',
  "onChangeAttr.replace('__ID__',ch.id)": 'handler code with a channel id',
  "onChangeAttr.replace('__ID__',ab.id)": 'handler code with an AutoBotz id',
}

const html = readFileSync(PAGE, 'utf8')

type Fn = { name: string, params: string[], body: string }
const fns = new Map<string, Fn>()
for (const m of html.matchAll(/^(?:async )?function (\w+)\(([^)]*)\)\s*\{/gm)) {
  fns.set(m[1], { name: m[1], params: m[2].split(',').map((s) => s.trim()).filter(Boolean), body: html.slice(m.index, blockEnd(html, m.index + m[0].length - 1)) })
}

// ── A small lexer for strings, templates and their interpolations ──────────
type Tpl = { html: boolean, exprs: string[], children: Tpl[] }

// A / that starts a regex literal rather than a division.
function isRegexStart(src: string, i: number): boolean {
  if (src[i] !== '/' || src[i + 1] === '/' || src[i + 1] === '*') return false
  let j = i - 1
  while (j >= 0 && /\s/.test(src[j])) j--
  return j < 0 || '(,=:[!&|?{};+'.includes(src[j]) || /\breturn$/.test(src.slice(Math.max(0, j - 5), j + 1))
}
function readRegex(src: string, i: number): number {
  let cls = false
  for (i++; i < src.length && src[i] !== '\n'; i++) {
    if (src[i] === '\\') { i++; continue }
    if (src[i] === '[') cls = true
    else if (src[i] === ']') cls = false
    else if (src[i] === '/' && !cls) break
  }
  return i + 1
}
function readString(src: string, i: number): number {
  const q = src[i]
  for (i++; i < src.length && src[i] !== q; i++) if (src[i] === '\\') i++
  return i + 1
}
// Reads a template starting at the backtick at i. Nested templates in its
// interpolations become children; in the interpolation text they read as ``.
function readTemplate(src: string, i: number, out: Tpl[]): number {
  const t: Tpl = { html: false, exprs: [], children: [] }
  let lit = ''
  for (i++; i < src.length;) {
    const c = src[i]
    if (c === '\\') { lit += src.slice(i, i + 2); i += 2; continue }
    if (c === '`') { i++; break }
    if (c === '$' && src[i + 1] === '{') {
      const r = readExpr(src, i + 2, t.children)
      t.exprs.push(r.text); i = r.end; continue
    }
    lit += c; i++
  }
  t.html = /<[a-zA-Z/]/.test(lit)
  out.push(t)
  return i
}
function readExpr(src: string, i: number, out: Tpl[]): { text: string, end: number } {
  let depth = 0, text = ''
  while (i < src.length) {
    const c = src[i]
    if (c === "'" || c === '"') { const e = readString(src, i); text += src.slice(i, e); i = e; continue }
    if (isRegexStart(src, i)) { const e = readRegex(src, i); text += src.slice(i, e); i = e; continue }
    if (c === '`') { i = readTemplate(src, i, out); text += '``'; continue }
    if (c === '{') depth++
    if (c === '}') { if (depth === 0) return { text: text.trim(), end: i + 1 }; depth-- }
    text += c; i++
  }
  throw new Error('unterminated ${')
}
// The index just past the } that closes the { at i.
function blockEnd(src: string, i: number): number {
  let depth = 0
  for (; i < src.length; i++) {
    const c = src[i]
    if (c === '/' && src[i + 1] === '/') { i = src.indexOf('\n', i); continue }
    if (c === '/' && src[i + 1] === '*') { i = src.indexOf('*/', i) + 1; continue }
    if (c === "'" || c === '"') { i = readString(src, i) - 1; continue }
    if (isRegexStart(src, i)) { i = readRegex(src, i) - 1; continue }
    if (c === '`') { i = readTemplate(src, i, []) - 1; continue }
    if (c === '{') depth++
    else if (c === '}' && --depth === 0) return i + 1
  }
  return src.length
}
// Every template in a function body. A template inside an HTML template's
// interpolation lands in that HTML, so it counts as HTML too.
function templatesOf(body: string): Tpl[] {
  const top: Tpl[] = []
  for (let i = 0; i < body.length;) {
    const c = body[i]
    if (c === '/' && body[i + 1] === '/') { const n = body.indexOf('\n', i); i = n < 0 ? body.length : n; continue }
    if (c === "'" || c === '"') { i = readString(body, i); continue }
    if (isRegexStart(body, i)) { i = readRegex(body, i); continue }
    if (c === '`') { i = readTemplate(body, i, top); continue }
    i++
  }
  const all: Tpl[] = []
  const walk = (t: Tpl, inHtml: boolean) => { t.html ||= inHtml; all.push(t); t.children.forEach((c) => walk(c, t.html)) }
  top.forEach((t) => walk(t, false))
  return all
}
const withoutStrings = (s: string) => s.replace(/'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"/g, "''")

// ── Discovery ──────────────────────────────────────────────────────────────
const buildsHtml = (name: string) => templatesOf(fns.get(name)!.body).some((t) => t.html)
const CALL = /(?<![.\w$])([A-Za-z_$][\w$]*)\(/g
function markupCalls(body: string): string[] {
  const texts: string[] = []
  for (const t of templatesOf(body)) if (t.html) texts.push(...t.exprs)
  for (const m of body.matchAll(/innerHTML\s*\+?=\s*([^;\n]+)/g)) texts.push(m[1])
  for (const a of body.matchAll(/[\w$\]]\s*\+?=(?![=>])\s*([^;\n]+)/g)) texts.push(a[1])
  for (const r of body.matchAll(/\breturn\s+([^;\n]+)/g)) texts.push(r[1])
  return texts.flatMap((t) => [...withoutStrings(t).matchAll(CALL)].map((m) => m[1])).filter((n) => fns.has(n) && buildsHtml(n))
}
const checked = new Set([...fns.keys()].filter((n) => CONFIG_RENDERER.test(n)))
for (let grew = true; grew;) {
  grew = false
  for (const n of [...checked]) for (const c of markupCalls(fns.get(n)!.body)) if (!checked.has(c)) { checked.add(c); grew = true }
}

// ── Classification ─────────────────────────────────────────────────────────
function scan(e: string, at: (i: number, depth: number) => boolean | void) {
  let depth = 0
  for (let i = 0; i < e.length; i++) {
    const c = e[i]
    if (c === "'" || c === '"') { i = readString(e, i) - 1; continue }
    if (c === '`') { const n = e.indexOf('`', i + 1); if (n < 0) return; i = n; continue }
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) depth--
    else if (at(i, depth)) return
  }
}
function balanced(s: string) { let d = 0; for (const c of withoutStrings(s)) { if ('([{'.includes(c)) d++; else if (')]}'.includes(c) && --d < 0) return false } return d === 0 }
function splitTop(e: string, ops: string[]): string[] {
  const parts: string[] = []; let last = 0
  scan(e, (i, d) => {
    if (d) return
    const op = ops.find((o) => e.startsWith(o, i) && !(o === '+' && (e[i + 1] === '+' || e[i - 1] === '+')))
    if (op) { parts.push(e.slice(last, i)); last = i + op.length }
  })
  parts.push(e.slice(last)); return parts.map((x) => x.trim())
}
const unparsed: string[] = []
const isTernaryQ = (e: string, i: number) => e[i] === '?' && e[i + 1] !== '.' && e[i + 1] !== '?' && e[i - 1] !== '?'
// The parts of an expression whose value can be written out. Conditions are
// not: `r.name?'':'untitled'` writes one of two literals.
function leaves(e: string): string[] {
  e = e.trim()
  while (/^\([\s\S]*\)$/.test(e) && balanced(e.slice(1, -1))) e = e.slice(1, -1).trim()
  let q = -1
  scan(e, (i, d) => { if (!d && isTernaryQ(e, i)) { q = i; return true } })
  if (q >= 0) {
    let colon = -1, open = 0
    scan(e.slice(q + 1), (i, d) => {
      const s = e.slice(q + 1)
      if (d) return
      if (isTernaryQ(s, i)) open++
      else if (s[i] === ':') { if (open) open--; else { colon = q + 1 + i; return true } }
    })
    if (colon < 0) { unparsed.push(e); return [e] }
    return [...leaves(e.slice(q + 1, colon)), ...leaves(e.slice(colon + 1))]
  }
  for (const ops of [['||', '??'], ['+']]) {
    const parts = splitTop(e, ops); if (parts.length > 1) return parts.flatMap(leaves)
  }
  const ands = splitTop(e, ['&&']); if (ands.length > 1) return leaves(ands[ands.length - 1])
  return [e]
}

const LITERAL = /^(?:``|'(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*"|-?\d+(?:\.\d+)?|true|false|null|undefined)$/
const NUMBER = /^(?:[\s\S]+\.(?:length|size)|(?:Math\.\w+|parseInt|parseFloat|Number)\([\s\S]*\)|[\s\S]+\.toFixed\(\d\)|[\w$.\[\]]+\s*[-*/%]\s*[\w$.\[\]]+)$/
// For `xs.map(cb).join(...)` (optionally with .filter(Boolean)), the text of cb.
function mapJoinCallback(e: string): string | null {
  let at = -1
  scan(e, (i, d) => { if (!d && e.startsWith('.map(', i)) at = i })
  if (at < 0) return null
  let close = -1
  for (let i = at + 4, d = 0; i < e.length; i++) {
    const c = e[i]
    if (c === "'" || c === '"') { i = readString(e, i) - 1; continue }
    if (c === '`') { i = e.indexOf('`', i + 1); if (i < 0) break; continue }
    if ('([{'.includes(c)) d++
    else if (')]}'.includes(c) && --d === 0) { close = i; break }
  }
  if (close < 0 || !/^\)(?:\.filter\(Boolean\))?\.join\([^)]*\)$/.test(e.slice(close))) return null
  return e.slice(at + 5, close)
}

// Index parameters of callbacks (`(r,i)=>`), and locals assigned only once.
function indexParams(body: string) {
  return new Set([...body.matchAll(/\(\s*[\w$]+\s*,\s*([\w$]+)\s*\)\s*=>/g)].map((m) => m[1]))
}
function assignments(body: string, name: string): string[] {
  const re = new RegExp(`(?<![.\\w$])${name.replace(/\$/g, '\\$')}\\s*(\\+?=)(?![=>])`, 'g')
  return [...body.matchAll(re)].map((m) => assignmentText(body, m.index! + m[0].length))
}
// The expression that starts at i and ends at the statement's end.
function assignmentText(body: string, i: number): string {
  let depth = 0, text = ''
  for (; i < body.length; i++) {
    const c = body[i]
    if (c === "'" || c === '"') { const e = readString(body, i); text += body.slice(i, e); i = e - 1; continue }
    if (c === '`') { const e = readTemplate(body, i, []); text += body.slice(i, e); i = e - 1; continue }
    if ('([{'.includes(c)) depth++
    else if (')]}'.includes(c)) { if (--depth < 0) break }
    else if (!depth && (c === ';' || c === ',' || (c === '\n' && !/[?:+|&=(,]\s*$/.test(text) && !/^\s*[?:+|&.]/.test(body.slice(i + 1))))) break
    text += c
  }
  return text.trim()
}

// A value read from an assignment: its templates become `` for the leaves, and
// their interpolations must be safe too, since they reach the markup with it.
function safeValue(e: string, fn: Fn, seen: Set<string>): boolean {
  const ts: Tpl[] = []
  let flat = ''
  for (let i = 0; i < e.length;) {
    if (e.startsWith('``', i)) { flat += '``'; i += 2; continue }
    if (e[i] === '`') { i = readTemplate(e, i, ts); flat += '``'; continue }
    if (e[i] === "'" || e[i] === '"') { const n = readString(e, i); flat += e.slice(i, n); i = n; continue }
    flat += e[i++]
  }
  const all: Tpl[] = []
  const walk = (t: Tpl) => { all.push(t); t.children.forEach(walk) }
  ts.forEach(walk)
  return all.every((t) => t.exprs.every((x) => safeValue(x, fn, seen))) &&
    leaves(flat).every((l) => safeLeaf(l, fn, seen))
}
function safeLeaf(leaf: string, fn: Fn, seen: Set<string>): boolean {
  if (LITERAL.test(leaf) || SAFE[leaf]) return true
  if (/^esc\([\s\S]*\)$/.test(leaf) && balanced(leaf.slice(4, -1))) return true
  const call = /^([A-Za-z_$][\w$]*)\(([\s\S]*)\)$/.exec(leaf)
  if (call && balanced(call[2]) && checked.has(call[1]) && buildsHtml(call[1])) return true
  if (NUMBER.test(leaf)) return true
  const cbText = mapJoinCallback(leaf)
  if (cbText !== null) {
    // The callback's results are what gets joined into the markup.
    const cb = /^\s*(?:[\w$]+|\(\s*\[?[\w$\s,]*\]?\s*\))\s*=>\s*([\s\S]*)$/.exec(cbText)
    if (!cb) return false
    const b = cb[1].trim()
    if (!b.startsWith('{')) return safeValue(b, fn, seen)
    const rets = [...b.matchAll(/(?<![\w$])return\b/g)].map((r) => assignmentText(b, r.index! + 6))
    return rets.length > 0 && rets.every((r) => safeValue(r, fn, seen))
  }
  if (/^[\w$]+$/.test(leaf)) {
    if (indexParams(fn.body).has(leaf)) return true
    if (fn.params.includes(leaf)) return false
    const k = `${fn.name}:${leaf}`
    if (localVerdict.has(k)) return localVerdict.get(k)!
    if (seen.has(k)) return false // a cycle proves nothing
    const rhs = assignments(fn.body, leaf)
    seen.add(k)
    const ok = rhs.length > 0 && rhs.every((r) => safeValue(r, fn, seen))
    seen.delete(k)
    localVerdict.set(k, ok)
    return ok
  }
  return false
}
const localVerdict = new Map<string, boolean>()

function rawWrites(): string[] {
  const raw: string[] = []
  for (const n of checked) {
    const fn = fns.get(n)!
    for (const t of templatesOf(fn.body)) if (t.html) for (const e of t.exprs) {
      const bad = leaves(e).filter((l) => !safeLeaf(l, fn, new Set()))
      if (bad.length) raw.push(`${n}: ${bad.join(' | ')}`)
    }
  }
  return raw
}

test('the page declares one encoder', () => {
  assert.ok(fns.has('esc'), 'function esc(s){ is declared at top level')
  const encode = new Function(`${fns.get('esc')!.body}; return esc`)() as (s: unknown) => string
  assert.equal(encode(`<b>x</b>"'&`), '&lt;b&gt;x&lt;/b&gt;&quot;&#39;&amp;')
  assert.equal(encode(null), '')
  assert.equal(encode(undefined), '')
  assert.equal(encode(0), '0')
})

test('discovery reaches the renderers and the helpers they compose', () => {
  for (const n of ['renderChannelsCfg', 'renderThresholdsCfg', 'renderAnomaliesCfg', 'renderTextRulesCfg',
    'renderAlarmsTab', 'renderActionsTab', '_anomRespCard', '_delRow', '_renderAutoBotz', '_abFormFields']) {
    assert.ok(checked.has(n), n)
  }
})

test('every value written into the renderers\' markup is encoded or justified', () => {
  assert.deepEqual(rawWrites(), [])
  assert.deepEqual(unparsed, [], 'every interpolation parses')
})

// Identifiers go into inline handlers (onclick="openAB('…')"), where esc does
// not help. Stored ones are kept to [\w-] where they enter the page.
test('stored identifiers are validated where they load', () => {
  assert.ok(fns.has('safeId'), 'function safeId is declared')
  const safeId = new Function(`${fns.get('safeId')!.body}; return safeId`)() as (v: unknown) => string | null
  assert.equal(safeId('ab_1-x'), 'ab_1-x')
  assert.equal(safeId("x');alert(1)//"), null)
  assert.equal(safeId(''), null)
  assert.equal(safeId(7), null)
  const method = (name: string) => {
    const at = html.search(new RegExp(`^\\s*async ${name}\\(`, 'm'))
    assert.ok(at >= 0, name)
    return html.slice(at, blockEnd(html, html.indexOf('{', at)))
  }
  assert.match(method('loadChannels'), /id:safeId\(row\.id\)/)
  assert.match(method('loadAutoBotz'), /id:safeId\(row\.client_id\)/)
  assert.match(fns.get('_thKey')!.body, /safeId\(c\.actorId\)/)
})
