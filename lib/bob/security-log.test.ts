// Every refusal for lack of a role is recorded (ASVS 4.0.3 V7.2.2).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { NextRequest } from 'next/server.js'
import { boxProxy } from './box-proxy.ts'

test('the proxy records who was refused and where, without the query string', async () => {
  const lines: string[] = []
  const info = console.info
  console.info = (line: string) => { lines.push(line) }
  try {
    const r = await boxProxy(new NextRequest('http://box.test/api/bob/quality?secret=1'), {
      gotrueUrl: () => 'http://gotrue.test',
      resolveSession: async () => ({ kind: 'user', user: { id: 'aaaaaaaa-1111-4000-8000-000000000001', email: 'user@example.com' } }),
      role: async () => null,
    })
    assert.equal(r.status, 403)
  } finally { console.info = info }
  assert.equal(lines.length, 1)
  const line = JSON.parse(lines[0])
  assert.deepEqual([line.event, line.path, line.method, line.user], ['access.no_role', '/api/bob/quality', 'GET', 'aaaaaaaa-1111-4000-8000-000000000001'])
})
