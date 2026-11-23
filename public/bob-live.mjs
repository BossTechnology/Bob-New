// The simulator's live painter (P-4).
//
// dashboard.html invents every figure. When /api/bob/* answers (in the box,
// or with BOB_PERF_MATRIX=1), this module stops the simulation and paints the
// three screens from bob's projections instead. Outside the box the API
// answers 404 (or a redirect to the login) and the simulator runs as before.
//
// The rule is the one the /bob pages keep (contract §5): a figure with no
// projection row is never painted as 0, and a figure no projection carries
// says "sin proyección". The panels with no equivalent in bob (BObee, alerts,
// alarms, actions, anomalies, the drawers, the simulator's settings) are
// hidden, not faked.
//
// The top half is pure and tested from lib/bob/bob-live.test.ts; start() is
// the DOM side.

export const NO_PROJECTION = 'sin proyección'

const ENDPOINTS = ['interactions', 'quality', 'performance']
const REFRESH_MS = 60_000
const TIMEOUT_MS = 10_000
const RANGE = { ahora: 'now', now: 'now', hoy: 'today', today: 'today', semana: 'week', week: 'week', mes: 'month', month: 'month' }
const STATES = ['s0', 's1', 's2', 's3', 's4']
// The RENDIMIENTO stats box holds these; the metrics box takes the rest.
const IN_STATS = ['available', 'response_time', 'quality']

const plain = (v) => String(Math.round(v * 10) / 10)

export function durationText(ms) {
  if (ms < 60_000) return `${Math.round(ms / 1000)} s`
  return `${(ms / 60_000).toFixed(1)} min`
}

// One cell, as the /bob pages paint it (app/bob/screen-parts.tsx, CellText).
export function cellText(cell, format = plain) {
  if (!cell || cell.kind === 'no_row') return { text: 'sin fila', cls: 'bob-norow' }
  if (cell.kind === 'zero') return { text: '0', cls: 'bob-zero' }
  return { text: format(cell.value), cls: '' }
}

// The simulator's window select (#timeSel) as the API's query. `tz` is
// Date.getTimezoneOffset() of the viewer.
export function screenQuery(sel, tz) {
  if (sel.value === 'custom' && sel.from && sel.to) {
    return new URLSearchParams({ from: sel.from.toISOString(), to: sel.to.toISOString() }).toString()
  }
  return new URLSearchParams({ range: RANGE[sel.value] ?? 'now', tz: String(tz) }).toString()
}

// Ánimo & Sentimiento: per state, the ORGA and MECA counts on one scale.
// States are ordinal (contract §6.2): nothing here sums or averages them.
// A state with no row has no bar (ratio null), a written zero a flat one.
export function sentimentBars(orga, meca) {
  const val = (c) => (c && c.kind === 'value' ? c.value : 0)
  const max = Math.max(1, ...STATES.flatMap((s) => [val(orga[s]), val(meca[s])]))
  const bar = (c) => ({
    ratio: !c || c.kind === 'no_row' ? null : val(c) / max,
    text: cellText(c).text,
  })
  return STATES.map((s) => ({ state: s, orga: bar(orga[s]), meca: bar(meca[s]) }))
}

// Live only when the API speaks JSON and does not say 404. A redirect to the
// login (outside the box, no session) is the demo too.
export function liveMode(status, json) {
  return json && status !== 404
}

// What the page is, after the first read. 'box' when bob answers; the demo
// only when /api/health says, in JSON, that this server is not a box (the
// box's health names its identity service); anything else is 'closed': a
// gateway page, a redirect from a gate in front of the box, no answer. A
// closed page shows nothing and loads no stored configuration.
export function pageMode(first, health) {
  if (liveMode(first.status, first.json)) return 'box'
  const b = health?.json ? health.body : null
  return b && typeof b === 'object' && !('identity' in b) ? 'demo' : 'closed'
}

export const CLOSED_TEXT = 'BOb no pudo confirmar sus datos. Recarga la página en un momento.'

export function failureText(status, error) {
  if (status === 403) return 'Sin acceso: tu cuenta no tiene un rol activo en bob.'
  if (status === 503) return 'bob no disponible en este momento. Se reintenta cada minuto.'
  if (status === 400) return `Ventana no válida: ${error}`
  return 'No se pudo leer bob. Se reintenta cada minuto.'
}

// Thresholds in the box. Only figures bob paints take one, stored under the
// simulator's own keys: bob.threshold_configs was built to map to
// metricCfg[mid] (BOb-engine, 20260729130000_v3_config_persistence.sql).
// Nothing here evaluates a threshold or colours a breach: that rule belongs to
// the engine (Slice 5), not to TypeScript. `row` is the matrix row it sits on.
export const THRESHOLD_TARGETS = {
  avgtime: { label: 'Tiempo Prom.', unit: 'min', row: null },
  res: { label: 'Resueltos', unit: '', row: 'resolved' },
  aba: { label: 'Abandonados', unit: '', row: 'abandoned' },
  des: { label: 'Desambiguación', unit: '', row: 'disambiguation' },
  der: { label: 'Derivaciones', unit: '', row: 'escalations' },
  alu: { label: 'Alucinaciones', unit: '', row: 'hallucinations' },
}

// The PUT body for /api/config/thresholds/:metricId. Peak settings are kept
// as they are: this editor only sets the bounds. An empty field is no bound.
export function thresholdBody(form, current) {
  const parse = (raw, name) => {
    const t = String(raw ?? '').trim()
    if (t === '') return { value: null }
    const n = Number(t.replace(',', '.'))
    if (!Number.isFinite(n)) return { error: `El límite ${name} no es un número.` }
    if (n < 0) return { error: `El límite ${name} no puede ser negativo.` }
    return { value: n }
  }
  const upper = parse(form.upper, 'superior')
  if (upper.error) return { ok: false, error: upper.error }
  const lower = parse(form.lower, 'inferior')
  if (lower.error) return { ok: false, error: lower.error }
  if (upper.value !== null && lower.value !== null && lower.value > upper.value) {
    return { ok: false, error: 'El límite inferior no puede pasar del superior.' }
  }
  return {
    ok: true,
    body: {
      upper_bound: upper.value,
      lower_bound: lower.value,
      peak_mode: current?.peak_mode ?? 'off',
      peak_windows: current?.peak_windows ?? [],
    },
  }
}

export function saveFailureText(status, error = '') {
  if (status === 403) return 'Tu papel en bob no permite editar umbrales (hace falta admin o analyst).'
  if (status === 400) return `No se guardó: ${error}`
  if (status === 503) return 'bob no disponible en este momento; no se guardó.'
  return 'No se pudo guardar el umbral.'
}

// ── DOM ─────────────────────────────────────────────────────────────────────

const $ = (id) => document.getElementById(id)
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`)
const span = ({ text, cls }, title = '') =>
  `<span class="${cls}"${title ? ` title="${esc(title)}"` : ''}>${esc(text)}</span>`
const noProjection = (title = '') => span({ text: NO_PROJECTION, cls: 'bob-noproj' }, title)

async function read(name, query) {
  const ctl = new AbortController()
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`/api/bob/${name}?${query}`, { redirect: 'manual', signal: ctl.signal, cache: 'no-store' })
    const json = (res.headers.get('content-type') ?? '').includes('application/json')
    const body = json ? await res.json() : null
    return { status: res.status, json, body }
  } catch {
    return { status: 0, json: true, body: { ok: false, error: 'network' } }
  } finally {
    clearTimeout(timer)
  }
}

const CSS = `
html.bob-live .bobee-btn,html.bob-live #hdrAnomaliesBtn,html.bob-live #hdrAlertsBtn,
html.bob-live #hdrAlarmsBtn,html.bob-live #hdrActionsBtn,html.bob-live #downloadBtn,
html.bob-live .hamburger,html.bob-live .ch-cell-cb,html.bob-live #trendArr{display:none!important}
html.bob-live .click,html.bob-live .cellable,html.bob-live [onclick]{cursor:default!important}
html.bob-live #headerLogo{pointer-events:none}
.bob-norow{color:var(--gray-light,#999);font-style:italic;font-size:.75em;font-weight:500}
.bob-noproj{color:var(--gray-light,#999);font-style:italic;font-size:12px;font-weight:500;letter-spacing:normal;line-height:1.2}
.stat-val .bob-noproj,.stat-val .bob-norow,.m-pct .bob-norow{font-size:10px}
.bob-zero{color:inherit}
#bobLiveBar{font-size:11px;color:var(--gray-mid,#666);padding:4px 20px;border-bottom:1px solid var(--gray-border,#eee)}
#bobLiveBar.bad{color:var(--red,#BD4444)}
.bob-lp{display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:4px;flex:1;position:relative;padding-bottom:26px}
.bob-lp-bars{display:flex;gap:6px;align-items:flex-end;height:140px}
.bob-lp-bar{width:10px;border-radius:3px 3px 0 0;background:var(--black,#111)}
.bob-lp-bar.meca{background:var(--accent,#C6E7FF);outline:1px solid var(--black,#111)}
.bob-lp-num{font-size:10px;color:var(--gray-mid,#666);text-align:center;line-height:1.3}
html.bob-live .bob-editable,html.bob-live .bob-editable *{cursor:pointer!important}
html.bob-live .bob-editable:hover{background:var(--gray-bg,#f6f6f6)}
#bobThreshold{margin:auto;border:1px solid var(--gray-border,#ddd);border-radius:12px;padding:20px;width:min(360px,calc(100vw - 32px));font:13px 'DM Sans',sans-serif;color:var(--black,#111)}
#bobThreshold::backdrop{background:rgba(0,0,0,.25)}
#bobThreshold h3{font-size:15px;margin-bottom:4px}
#bobThreshold .hint{font-size:11px;color:var(--gray-mid,#666);margin-bottom:14px;line-height:1.4}
#bobThreshold label{display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:10px}
#bobThreshold input{width:120px;padding:6px 8px;border:1px solid var(--gray-border,#ddd);border-radius:6px;font:inherit}
#bobThreshold .msg{min-height:16px;font-size:12px;margin:4px 0 10px}
#bobThreshold .msg.bad{color:var(--red,#BD4444)}
#bobThreshold .btns{display:flex;justify-content:flex-end;gap:8px}
#bobThreshold button{padding:7px 14px;border-radius:6px;border:1px solid var(--gray-border,#ddd);background:#fff;font:inherit;cursor:pointer}
#bobThreshold button.primary{background:var(--black,#111);color:#fff;border-color:var(--black,#111)}
#bobThreshold button:disabled{opacity:.5;cursor:default}
`

// The simulation's entry points, turned off once bob answers. They are
// top-level function declarations of dashboard.html, so they live on window.
export const SIM_OFF = [
  'tick', 'restartSim', 'applyTimeframe', 'openActionables', 'openWho', 'openChannelActionables',
  'openFaqActionables', 'openBobee', 'openSidebar', 'openAnomaliesModal', 'openAlertsModal',
  'openAlarmsModal', 'openActionsModal', 'toggleDashCh', 'downloadReport',
  // A tick that ran before the stop leaves timers behind that redraw the
  // ranked lists and widgets seconds later; their redraws go too.
  'renderDynList', 'initDynList', 'renderAccTemas', 'renderFAQ', 'applyIndustryContent',
  'renderMetrics', 'renderLollipops', 'updateLollipop', 'renderChannelDisplay', 'resortChannelDisplay',
  'updateSesDisplay', 'updateAvailableRow',
  // These write stored configuration (labels, names, windows) into innerHTML
  // without escaping. The box has its own editor, so none of them may run.
  'switchActTab', 'renderAlarmsTab', 'renderActionsTab', 'renderActivityTab', 'renderAlertsTab',
  'renderConfigTab', 'renderTextRulesCfg', 'renderThresholdsCfg', 'renderAnomaliesCfg', 'renderAutoBotzCfg',
  'renderChannelsCfg', 'renderSessionsConfig', 'renderAvgTimeConfig', 'renderSentimentConfig',
  'renderKeywordConfig', 'renderKeywordRules', 'renderQualityConfig', 'renderMetricColConfig',
  'renderActBobeeTab', 'renderABFields', 'renderChannelsCfgOrBotz', 'renderAnomaliesTab',
  'renderAnomaliesModal', 'renderAlertsModal', 'renderAlarmsModal', 'renderActionsModal',
  // Every other function that writes interpolated HTML (lib/bob/simulator-sinks.test.ts finds them).
  'onIndustryChange', 'renderIconGrid', 'handleLogo', 'populateChAddSelect', 'renderSbChannels',
  'applyAIData', 'applyLang', 'onChannelsChanged', 'renderFaqActivity', 'renderWordsActivity',
  'renderSessionsActivity', 'renderAvgTimeActivity', 'renderSentimentActivity', 'renderActionsActivity',
  'renderTemasActivity', 'renderGenericActivity', 'updateNcPlaceholder', 'confirmRemoveCh', 'appendBobeeMsg',
  'renderWordCloud', 'renderNpsActivity', 'sendActBobeeChat', 'renderChannelActivity',
  'renderAvailableActivity', 'filterAnomalyModal', 'filterAlertModal', 'applyConfigSnapshot',
]

function stopSimulation() {
  // `let simTimer` is a global lexical binding, not a window property.
  try { clearInterval(simTimer) } catch { /* not defined: nothing runs */ }
  for (const name of SIM_OFF) if (typeof window[name] === 'function') window[name] = () => {}
}

function bar() {
  let el = $('bobLiveBar')
  if (!el) {
    el = document.createElement('div')
    el.id = 'bobLiveBar'
    document.querySelector('header')?.after(el)
  }
  return el
}

const when = (iso) => (iso ? new Date(iso).toLocaleString([], { dateStyle: 'short', timeStyle: 'short' }) : '—')

function paintStatus(data, failure) {
  const el = bar()
  el.classList.toggle('bad', !!failure)
  if (failure) { el.textContent = failure; return }
  const w = data.window
  el.textContent = `Datos de bob · ${when(w?.from)} → ${when(w?.to)} · marca de agua ${when(data.watermark)}`
}

function libraryIcon(type) {
  const lib = typeof CH_LIBRARY !== 'undefined' ? CH_LIBRARY : []
  return lib.find((x) => x.id === type)?.svg ?? ''
}

function paintInteractions(d) {
  const s = d.screen
  $('sesCount').innerHTML = noProjection(s.sessions.note)
  const avg = cellText(s.avgDuration, durationText)
  const [num, unit] = s.avgDuration.kind === 'value' ? avg.text.split(' ') : [avg.text, '']
  $('avgTimeNum').innerHTML = span({ text: num, cls: avg.cls })
  $('avgTimeUnit').textContent = unit ? ` ${unit}` : ''
  $('chDisplay').innerHTML = s.byChannel.map(({ channel, closed }) => {
    const c = cellText(closed)
    return `<div class="ch-cell" title="${esc(channel.name)} · conversaciones cerradas">
      <div class="ch-cell-icon" style="color:#111">${libraryIcon(channel.type) || esc(channel.name.slice(0, 2))}</div>
      <div class="ch-cell-count">${span(c)}</div></div>`
  }).join('') || noProjection('ningún canal en bob.channels')
  const note = $('chFilterNote')
  if (note) note.textContent = 'conversaciones cerradas por canal'
}

function paintQuality(d) {
  const s = d.screen
  $('npsBadge').innerHTML = `NPS: ${noProjection(s.nps.note)}`
  const chart = $('lpChart')
  chart.querySelectorAll('.lp-item,.bob-lp').forEach((e) => e.remove())
  const labels = typeof T !== 'undefined' && typeof CFG !== 'undefined' ? T[CFG.lang].sent : STATES
  const h = (r) => (r === null ? 0 : Math.max(2, Math.round(r * 130)))
  sentimentBars(s.orga.states, s.meca.states).forEach((b, i) => {
    const item = document.createElement('div')
    item.className = 'bob-lp'
    item.title = `${labels[i]} · ORGA ${b.orga.text} · MECA ${b.meca.text}`
    item.innerHTML = `<div class="bob-lp-bars">
        <div class="bob-lp-bar" style="height:${h(b.orga.ratio)}px;display:${b.orga.ratio === null ? 'none' : ''}"></div>
        <div class="bob-lp-bar meca" style="height:${h(b.meca.ratio)}px;display:${b.meca.ratio === null ? 'none' : ''}"></div>
      </div>
      <div class="bob-lp-num">${esc(b.orga.text)} / ${esc(b.meca.text)}</div>
      <div class="lp-lbl">${labels[i]}</div>`
    chart.appendChild(item)
  })
  for (const id of ['temList', 'accList']) $(id).innerHTML = `<li>${noProjection()}</li>`
  for (const id of ['faqBody', 'wordsBody']) $(id).innerHTML = `<div style="padding:12px 0">${noProjection()}</div>`
}

function paintPerformance(d) {
  const m = d.matrix
  const actors = ['user', 'asa', 'human']
  const row = (id) => m.rows.find((r) => r.spec.id === id)
  for (const a of actors) $(`avail-${a}`).innerHTML = noProjection(row('available')?.spec.source.note ?? '')
  const statRows = document.querySelectorAll('.stats-box .stat-row.click')
  const fill = (el, cells) => el && el.querySelectorAll('.stat-val').forEach((v, i) => { v.innerHTML = cells[i] })
  const rt = row('response_time')
  fill(statRows[0], actors.map((a) => span(cellText(rt.cells[a], durationText))))
  fill(statRows[1], actors.map(() => noProjection(row('quality')?.spec.source.note ?? '')))
  $('metricsBox').innerHTML = m.rows.filter((r) => !IN_STATS.includes(r.spec.id)).map((r) => {
    const key = targetOfRow(r.spec.id)
    const edit = key ? ` bob-editable" data-threshold="${key}` : ''
    return `
    <div class="m-row${edit}" title="${esc(key ? 'Editar umbral' : (r.spec.note ?? ''))}">
      <div class="m-icon"></div>
      <div class="m-name">${esc(r.spec.label)}</div><div class="m-total">${span(cellText(r.total))}</div>
      ${actors.map((a, i) => `<div class="m-pct${i === 1 ? ' ai' : ''}">${span(cellText(r.cells[a]))}</div>`).join('')}
    </div>`
  }).join('')
  if (m.actors.includes('arep')) {
    $('metricsBox').insertAdjacentHTML('beforeend',
      '<div class="m-row"><div class="m-name bob-noproj">AREP no cabe en esta vista: ver /bob/performance</div></div>')
  }
}

const PAINT = { interactions: paintInteractions, quality: paintQuality, performance: paintPerformance }

// Before the first answer, and whenever a read fails, every figure of that
// screen shows a dash: the simulator's own figures are never left on screen,
// and the last window's figures are not passed off as the new one's. What no
// projection carries says so either way.
const UNREAD = { text: '—', cls: 'bob-norow' }
const unread = () => span(UNREAD, 'no se pudo leer bob')
const BLANK = {
  interactions() {
    $('sesCount').innerHTML = noProjection()
    $('avgTimeNum').innerHTML = unread()
    $('avgTimeUnit').textContent = ''
    $('chDisplay').innerHTML = unread()
    const note = $('chFilterNote')
    if (note) note.textContent = ''
  },
  quality() {
    $('npsBadge').innerHTML = `NPS: ${noProjection()}`
    $('lpChart').querySelectorAll('.lp-item,.bob-lp').forEach((e) => e.remove())
    for (const id of ['temList', 'accList']) $(id).innerHTML = `<li>${noProjection()}</li>`
    for (const id of ['faqBody', 'wordsBody']) $(id).innerHTML = `<div style="padding:12px 0">${noProjection()}</div>`
  },
  performance() {
    for (const a of ['user', 'asa', 'human']) $(`avail-${a}`).innerHTML = noProjection()
    const statRows = document.querySelectorAll('.stats-box .stat-row.click')
    statRows[0]?.querySelectorAll('.stat-val').forEach((v) => { v.innerHTML = unread() })
    statRows[1]?.querySelectorAll('.stat-val').forEach((v) => { v.innerHTML = noProjection() })
    $('metricsBox').innerHTML = `<div class="m-row"><div class="m-name">${unread()}</div></div>`
  },
}

function paintOrBlank(name, r) {
  try {
    if (r.body && r.body.ok) PAINT[name](r.body.data)
    else BLANK[name]()
  } catch (e) {
    console.error(`[bob-live] ${name}`, e)
    BLANK[name]()
  }
}

function currentQuery() {
  const value = $('timeSel')?.value ?? 'ahora'
  const at = (date, time) => (date ? new Date(`${date}T${time || '00:00'}`) : null)
  const from = at($('dateFrom')?.value, $('timeFrom')?.value)
  const to = at($('dateTo')?.value, $('timeTo')?.value || '23:59')
  return screenQuery({ value, from, to }, new Date().getTimezoneOffset())
}

// Refreshes can overlap (the minute timer, a window change): only the latest
// one paints.
let latest = 0

async function refresh() {
  const seq = ++latest
  const query = currentQuery()
  const results = await Promise.all(ENDPOINTS.map((name) => read(name, query)))
  if (seq !== latest) return
  const bad = results.find((r) => !(r.body && r.body.ok))
  if (bad) {
    // A static page, not a Next component: the session ended, go to the login.
    if (bad.status === 401) { window.location.assign(new URL('/login', window.location.origin)); return }
    paintStatus(null, failureText(bad.status, bad.body?.error ?? ''))
  } else {
    paintStatus(results[0].body.data, null)
  }
  ENDPOINTS.forEach((name, i) => paintOrBlank(name, results[i]))
}

// ── Threshold editor ────────────────────────────────────────────────────────

const targetOfRow = (rowId) => Object.keys(THRESHOLD_TARGETS).find((k) => THRESHOLD_TARGETS[k].row === rowId)

async function configCall(metricId, init) {
  try {
    const res = await fetch(`/api/config/thresholds/${encodeURIComponent(metricId)}`, {
      cache: 'no-store', redirect: 'manual', ...init,
      headers: { 'content-type': 'application/json', ...(init?.headers ?? {}) },
    })
    const json = (res.headers.get('content-type') ?? '').includes('application/json')
    return { status: res.status, body: json ? await res.json() : null }
  } catch {
    return { status: 0, body: null }
  }
}

function thresholdDialog() {
  let d = $('bobThreshold')
  if (d) return d
  d = document.createElement('dialog')
  d.id = 'bobThreshold'
  d.innerHTML = `<form method="dialog">
      <h3></h3>
      <div class="hint">En la caja nada evalúa todavía este umbral: se guarda en bob para cuando el motor lo haga. Campo vacío = sin límite.</div>
      <label>Límite superior <span><input name="upper" inputmode="decimal" autocomplete="off"> <span class="unit"></span></span></label>
      <label>Límite inferior <span><input name="lower" inputmode="decimal" autocomplete="off"> <span class="unit"></span></span></label>
      <div class="msg" role="status"></div>
      <div class="btns"><button type="button" value="cancel">Cancelar</button><button type="submit" class="primary">Guardar</button></div>
    </form>`
  d.querySelector('button[value=cancel]').addEventListener('click', () => d.close())
  document.body.appendChild(d)
  return d
}

async function openThresholdEditor(metricId) {
  const target = THRESHOLD_TARGETS[metricId]
  if (!target) return
  const d = thresholdDialog()
  const form = d.querySelector('form')
  const msg = d.querySelector('.msg')
  const save = d.querySelector('button.primary')
  const say = (text, bad = false) => { msg.textContent = text; msg.classList.toggle('bad', bad) }
  d.querySelector('h3').textContent = `Umbral · ${target.label}`
  d.querySelectorAll('.unit').forEach((u) => { u.textContent = target.unit })
  form.upper.value = ''
  form.lower.value = ''
  save.disabled = true
  say('Leyendo…')
  d.showModal()

  const got = await configCall(metricId)
  let current = null
  if (got.body?.ok) {
    current = got.body.data
    form.upper.value = current?.upper_bound ?? ''
    form.lower.value = current?.lower_bound ?? ''
    say(current ? '' : 'Sin umbral guardado.')
    save.disabled = false
  } else {
    say(failureText(got.status, got.body?.error ?? ''), true)
  }

  form.onsubmit = async (e) => {
    e.preventDefault()
    const b = thresholdBody({ upper: form.upper.value, lower: form.lower.value }, current)
    if (!b.ok) { say(b.error, true); return }
    save.disabled = true
    say('Guardando…')
    const put = await configCall(metricId, { method: 'PUT', body: JSON.stringify(b.body) })
    save.disabled = false
    if (put.body?.ok) {
      current = put.body.data
      say('Umbral guardado.')
      setTimeout(() => d.open && d.close(), 700)
    } else {
      say(saveFailureText(put.status, put.body?.error ?? ''), true)
    }
  }
}

function enableThresholds() {
  window.openActionables = (metricId) => { openThresholdEditor(metricId) }
  // The simulator opens Tiempo Prom. from the Response Time label too; in bob
  // they are two measures (interaction_duration and response_time), so only
  // the Tiempo Prom. card edits it.
  const tr = $('lbl-tr')
  if (tr) tr.onclick = null
  $('avgTimeNum')?.closest('.card-panel')?.classList.add('bob-editable')
  $('metricsBox')?.addEventListener('click', (e) => {
    const row = e.target.closest?.('[data-threshold]')
    if (row) openThresholdEditor(row.dataset.threshold)
  })
}

async function readHealth() {
  try {
    const res = await fetch('/api/health', { redirect: 'manual', cache: 'no-store' })
    const json = (res.headers.get('content-type') ?? '').includes('application/json')
    return { json, body: json ? await res.json() : null }
  } catch {
    return null
  }
}

// The simulator stays hidden and stopped; only a message shows.
function closePage() {
  stopSimulation()
  if ($('bobClosed')) return
  const el = document.createElement('div')
  el.id = 'bobClosed'
  el.setAttribute('role', 'alert')
  el.style.cssText = 'position:fixed;top:40%;left:0;right:0;text-align:center;font:14px sans-serif;color:#666'
  el.textContent = CLOSED_TEXT
  document.body.appendChild(el)
}

export async function start() {
  const first = await read(ENDPOINTS[0], currentQuery())
  const mode = liveMode(first.status, first.json) ? 'box' : pageMode(first, await readHealth())
  if (mode === 'closed') {
    closePage()
    return false
  }
  if (mode === 'demo') {
    document.documentElement.classList.remove('bob-pending')
    // dashboard.html loads its stored configuration only on this signal.
    window.dispatchEvent(new Event('bob:demo'))
    return false
  }
  const style = document.createElement('style')
  style.textContent = CSS
  document.head.appendChild(style)
  document.documentElement.classList.add('bob-live')
  stopSimulation()
  for (const name of ENDPOINTS) BLANK[name]()
  enableThresholds()
  // The window controls now read bob instead of rescaling invented numbers.
  window.onTimeChange = (v) => {
    $('drWrap')?.classList.toggle('show', v === 'custom')
    if (typeof window.updateTimeLabel === 'function') window.updateTimeLabel(v)
    if (v !== 'custom') refresh()
  }
  window.applyDate = () => {
    const dd = $('drDropdown')
    if (dd) dd.style.display = 'none'
    refresh()
  }
  // The page stays hidden (bob-pending, set in dashboard.html's head) until
  // bob's figures are painted, so no invented figure is ever visible.
  await refresh()
  document.documentElement.classList.remove('bob-pending')
  setInterval(refresh, REFRESH_MS)
  return true
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  start().catch((e) => {
    console.error('[bob-live]', e)
    closePage()
  })
}
