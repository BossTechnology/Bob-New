// Box start-up (insumos de Bzzz §4.2): with missing configuration, a
// forbidden credential or a privileged database login, BOb does not start.
// Next only logs an error thrown in register(), so the process must exit
// itself, or the container stays `running` answering 500.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { startBox } from './startup.ts'

const run = async (o: { env?: () => void; login?: () => Promise<void> }) => {
  const exits: number[] = []
  const logs: string[] = []
  await startBox({
    assertEnv: o.env ?? (() => {}),
    checkLogin: o.login ?? (async () => {}),
    exit: (c) => { exits.push(c) },
    log: (m) => { logs.push(m) },
  })
  return { exits, logs }
}

test('a bad box environment exits the process with 1, saying why', async () => {
  const r = await run({ env: () => { throw new Error('BOb no arranca en modo caja: BOB_ORG_ID no está definida') } })
  assert.deepEqual(r.exits, [1])
  assert.match(r.logs.join('\n'), /BOB_ORG_ID/)
})

test('a privileged database login exits the process with 1', async () => {
  const r = await run({ login: async () => { throw new Error('el login de BOb es superusuario o BYPASSRLS') } })
  assert.deepEqual(r.exits, [1])
})

test('the environment is checked before the database is touched', async () => {
  let touched = false
  await run({ env: () => { throw new Error('bad') }, login: async () => { touched = true } })
  assert.equal(touched, false)
})

test('a good start does not exit', async () => {
  assert.deepEqual((await run({})).exits, [])
})
