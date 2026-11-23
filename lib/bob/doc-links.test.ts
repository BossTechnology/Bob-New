// A comment that points at a document points at one that is in the repo,
// unless it names the repo it is in (`BOb-engine, docs/...`).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? sources(join(dir, e.name)) : /\.(ts|tsx|mjs)$/.test(e.name) ? [join(dir, e.name)] : [])

test('every docs/ path cited in the code exists', () => {
  const missing = ['lib', 'app', 'public'].flatMap(sources).flatMap((f) =>
    readFileSync(f, 'utf8').split('\n').filter((l) => !/BOb-engine/.test(l))
      .flatMap((l) => [...l.matchAll(/\bdocs\/[\w./-]+\.md\b/g)].map((m) => m[0]))
      .filter((d) => !existsSync(d)).map((d) => `${f}: ${d}`))
  assert.deepEqual(missing, [])
})
