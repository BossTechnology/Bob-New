// The type and bound of every column /api/config writes in the box (ASVS
// 4.0.3 V5.1.3, V5.1.4, V5.2.2, V13.2.2). A column with no rule here is
// refused: adding one to tables.ts means saying what may go in it.
type Check = (v: unknown) => boolean

const CONTROL = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/
const text = (max: number): Check => (v) => typeof v === 'string' && v.length <= max && !CONTROL.test(v)
const oneOf = (...all: string[]): Check => (v) => typeof v === 'string' && all.includes(v)
const nullable = (c: Check): Check => (v) => v === null || c(v)
const list = (max: number, c: Check): Check => (v) => Array.isArray(v) && v.length <= max && v.every(c)
const matches = (re: RegExp): Check => (v) => typeof v === 'string' && re.test(v)

const uuid = matches(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i)
const metricId = matches(/^[A-Za-z0-9_.:-]{1,64}$/)
const time = matches(/^(?:[01]\d|2[0-3]):[0-5]\d$/)
const bound: Check = (v) => typeof v === 'number' && Number.isFinite(v) && v >= 0
const count: Check = (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 2_147_483_647
const timestamp: Check = (v) => typeof v === 'string' && !Number.isNaN(Date.parse(v))
const scope = { scope_kind: oneOf('company', 'metric', 'entity', 'actor'), scope_ref: nullable(text(200)) }

// The simulator writes {start, end, days}; {from, to} is the other shape in use.
const peakWindow: Check = (v) => {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) return false
  const w = v as Record<string, unknown>
  const [a, b] = 'start' in w ? ['start', 'end'] : ['from', 'to']
  return Object.keys(w).every((k) => k === a || k === b || k === 'days')
    && time(w[a]) && time(w[b]) && (w.days === undefined || oneOf('weekdays', 'weekends', 'all')(w.days))
}

const COMMON = { id: uuid, org_id: uuid, created_at: timestamp }

export const RULES: Record<string, Record<string, Check>> = {
  threshold_configs: {
    ...COMMON, ...scope,
    metric_id: metricId,
    upper_bound: nullable(bound),
    lower_bound: nullable(bound),
    peak_mode: oneOf('manual', 'observed', 'off'),
    peak_windows: list(24, peakWindow),
    updated_at: timestamp,
  },
  anomaly_rules: {
    ...COMMON, ...scope,
    metric_id: metricId,
    rule_type: oneOf('known', 'unknown_critical', 'unknown_warning'),
    name: text(200),
    condition: nullable(oneOf('contains', 'frequency', 'pattern')),
    keywords: nullable(text(2000)),
    freq_threshold: nullable(count),
  },
  text_rules: {
    ...COMMON, ...scope,
    metric_id: metricId,
    name: text(200),
    condition: oneOf('keyword', 'ranking', 'frequency', 'newentry'),
    value: nullable(text(2000)),
  },
  notification_channels: {
    ...COMMON,
    type: oneOf('email', 'sms', 'call', 'slack'),
    label: text(200),
    values: list(50, text(500)),
    updated_at: timestamp,
  },
  response_rules: {
    ...COMMON,
    threshold_id: nullable(uuid),
    anomaly_rule_id: nullable(uuid),
    text_rule_id: nullable(uuid),
    autobotz_id: nullable(uuid),
    type: oneOf('alert', 'alarm', 'action'),
    name: text(200),
    channel_ids: list(50, uuid),
    subject: text(500),
    message: text(5000),
  },
}

// Names the column, never the value. Columns that are not reachable at all
// are compile()'s to refuse.
// A peak window with an empty start or end never applied: the simulator
// leaves one behind when a row is added and not filled in. Dropped before the
// check, so an old one does not block saving the bounds.
export function cleanRow(table: string, row: Record<string, unknown>): Record<string, unknown> {
  if (table !== 'threshold_configs' || !Array.isArray(row.peak_windows)) return row
  const filled = (w: unknown) => {
    if (typeof w !== 'object' || w === null) return true
    const x = w as Record<string, unknown>
    const [a, b] = 'start' in x ? ['start', 'end'] : ['from', 'to']
    return x[a] !== '' && x[b] !== ''
  }
  return { ...row, peak_windows: row.peak_windows.filter(filled) }
}

export function rowProblem(table: string, row: Record<string, unknown>): string | null {
  const rules = Object.hasOwn(RULES, table) ? RULES[table] : undefined
  if (!rules) return `${table} takes no writes`
  for (const [col, value] of Object.entries(row)) {
    if (!Object.hasOwn(rules, col) || !rules[col](value)) return `invalid ${table}.${col}`
  }
  const { upper_bound: hi, lower_bound: lo } = row
  if (typeof hi === 'number' && typeof lo === 'number' && lo > hi) return `${table}.lower_bound is above upper_bound`
  return null
}
