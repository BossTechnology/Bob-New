// Writes that belong together run in one transaction in the box (ASVS 4.0.3
// V11.1.6). The demo's PostgREST client has none and runs them in turn.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { inOneTransaction } from './tables.ts'

test('in the box the steps get the transaction; elsewhere the client itself', async () => {
  const tx = { name: 'tx' }
  const box = { from: () => null, transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx) }
  assert.equal(await inOneTransaction(box as never, async (db) => db), tx)
  const demo = { from: () => null }
  assert.equal(await inOneTransaction(demo as never, async (db) => db), demo)
})

test('deleting a channel disconnects its rules and deletes it in one transaction', () => {
  const route = readFileSync('app/api/config/channels/[id]/route.ts', 'utf8')
  const del = route.slice(route.indexOf('export async function DELETE'))
  assert.match(del, /inOneTransaction\(sb, async \(db\) =>/)
  assert.doesNotMatch(del.slice(del.indexOf('inOneTransaction')), /\bsb\./, 'every step uses the transaction')
})
