// What /api/config may write in the box: every column typed and bounded
// (ASVS 4.0.3 V5.1.3, V5.1.4, V5.2.2, V13.2.2). One place: the table adapter
// every one of those writes goes through (tables.ts).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Pool } from 'pg'
import { RULES } from './config-input.ts'
import { TABLES, bobTables } from './tables.ts'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const ID = 'bbbbbbbb-0000-4000-8000-000000000001'

// A row that passes validation gets as far as asking for a connection.
async function write(table: string, row: Record<string, unknown>, op: 'insert' | 'update' = 'insert') {
  const pool = { connect: async () => { throw Object.assign(new Error('reached the database'), { code: 'REACHED' }) } }
  const t = bobTables(ORG, pool as unknown as Pool).from(table)
  const { error } = await (op === 'insert' ? t.insert({ org_id: ORG, ...row }) : t.update(row).eq('id', ID))
  return error?.code
}

const THRESHOLD = { metric_id: 'res', upper_bound: 90, lower_bound: 10, peak_mode: 'off', peak_windows: [] }
const CHANNEL = { type: 'email', label: 'Equipo', values: ['user@example.com'] }
const RESPONSE = { type: 'alert', threshold_id: ID, name: '', channel_ids: [ID], subject: '', message: 'hola\nequipo' }
const ANOMALY = { metric_id: 'res', rule_type: 'known', name: "Cliente d'Arc", condition: null, keywords: null, freq_threshold: 5 }

test('a bad threshold never reaches the database', async () => {
  for (const bad of [
    { metric_id: 'a b' }, { metric_id: 'x'.repeat(65) }, { metric_id: '"><b>' }, { metric_id: 7 },
    { upper_bound: '90' }, { upper_bound: -1 }, { upper_bound: Infinity }, { lower_bound: {} },
    { upper_bound: 5, lower_bound: 9 },
    { peak_mode: 'always' },
    { peak_windows: 'zzz' }, { peak_windows: [{ a: 1 }] }, { peak_windows: [null] },
    { peak_windows: [{ start: '"><b>', end: '11:00' }] },
    { peak_windows: [{ start: '09:00', end: '25:00' }] },
    { peak_windows: [{ start: '09:00', end: '11:00', days: 'sometimes' }] },
    { peak_windows: Array(25).fill({ start: '09:00', end: '11:00' }) },
  ]) {
    assert.equal(await write('threshold_configs', { ...THRESHOLD, ...bad }), 'BOB_QUERY', JSON.stringify(bad).slice(0, 80))
  }
})

test('the other rule tables are typed and bounded too', async () => {
  const bad: [string, Record<string, unknown>][] = [
    ['anomaly_rules', { ...ANOMALY, freq_threshold: 1.5 }],
    ['anomaly_rules', { ...ANOMALY, rule_type: 'other' }],
    ['anomaly_rules', { ...ANOMALY, keywords: ['a'] }],
    ['text_rules', { metric_id: 'temas', name: 'x'.repeat(201), condition: 'keyword', value: 'a' }],
    ['text_rules', { metric_id: 'temas', name: 'nul\u0000', condition: 'keyword', value: 'a' }],
    ['notification_channels', { ...CHANNEL, label: { en: 'Team' } }],
    ['notification_channels', { ...CHANNEL, values: 'user@example.com' }],
    ['notification_channels', { ...CHANNEL, values: Array(51).fill('a') }],
    ['response_rules', { ...RESPONSE, channel_ids: ['not-a-uuid'] }],
    ['response_rules', { ...RESPONSE, threshold_id: 'x' }],
    ['response_rules', { ...RESPONSE, message: 'x'.repeat(5001) }],
  ]
  for (const [table, row] of bad) assert.equal(await write(table, row), 'BOB_QUERY', `${table} ${JSON.stringify(row).slice(0, 80)}`)
  assert.equal(await write('notification_channels', { label: 7 }, 'update'), 'BOB_QUERY')
})

test('what the simulator and the box editor send passes', async () => {
  const good: [string, Record<string, unknown>][] = [
    ['threshold_configs', THRESHOLD],
    ['threshold_configs', { ...THRESHOLD, upper_bound: null, lower_bound: null, updated_at: new Date().toISOString() }],
    ['threshold_configs', { ...THRESHOLD, peak_windows: [{ start: '09:00', end: '11:00', days: 'weekdays' }, { from: '14:00', to: '16:00' }] }],
    ['anomaly_rules', ANOMALY],
    ['text_rules', { metric_id: 'faq', name: '', condition: 'ranking', value: '3' }],
    ['notification_channels', CHANNEL],
    ['response_rules', { ...RESPONSE, anomaly_rule_id: null, text_rule_id: null }],
  ]
  for (const [table, row] of good) assert.equal(await write(table, row), 'REACHED', table)
  assert.equal(await write('notification_channels', { label: 'Otro', updated_at: new Date().toISOString() }, 'update'), 'REACHED')
})

test('every column the adapter can reach has a rule', () => {
  for (const [table, { columns }] of Object.entries(TABLES)) {
    for (const c of columns) assert.ok(RULES[table]?.[c], `${table}.${c}`)
  }
})

test('a peak window left with an empty start or end is dropped, so it cannot block saving the bounds', async () => {
  const windows = [{ start: '', end: '' }, { start: '09:00', end: '' }, { start: '09:00', end: '11:00', days: 'weekdays' }]
  assert.equal(await write('threshold_configs', { ...THRESHOLD, peak_windows: windows }), 'REACHED')
  // A window that is filled in but wrong is still refused.
  assert.equal(await write('threshold_configs', { ...THRESHOLD, peak_windows: [{ start: '25:00', end: '11:00' }] }), 'BOB_QUERY')
})
