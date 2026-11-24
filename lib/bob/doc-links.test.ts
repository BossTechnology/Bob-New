// A comment that points at a document points at one that is in the repo,
// unless it names the repo it is in (`BOb-engine, docs/...`). Both document
// folders, any extension, in every source the app ships or runs.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

const SOURCE = /\.(ts|tsx|mjs|js|html|css)$/
const sources = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
  e.isDirectory() ? sources(join(dir, e.name)) : SOURCE.test(e.name) ? [join(dir, e.name)] : [])
const ROOT_FILES = readdirSync('.').filter((f) => SOURCE.test(f))

// The document paths a text cites, skipping lines that name another repo.
function cited(text: string): string[] {
  return text.split('\n').filter((l) => !/BOb-engine/.test(l))
    .flatMap((l) => [...l.matchAll(/\b(?:docs|Documentation)\/[\w./-]*\w\.[A-Za-z0-9]{1,5}\b/g)].map((m) => m[0]))
}

test('the citations found are documents in either folder, any extension', () => {
  const text = [
    '// see docs/adr/0001-x.md.',
    '// Documentation/New/Plan_v2.docx and docs/diagram.pdf',
    '// BOb-engine, docs/elsewhere.md',
    '// docs/... is a placeholder',
  ].join('\n')
  assert.deepEqual(cited(text), ['docs/adr/0001-x.md', 'Documentation/New/Plan_v2.docx', 'docs/diagram.pdf'])
})

test('every document path cited in the code exists', () => {
  // This file's own examples are not citations.
  const files = [...['lib', 'app', 'public', 'scripts'].flatMap(sources), ...ROOT_FILES]
    .filter((f) => f !== join('lib', 'bob', 'doc-links.test.ts'))
  const missing = files.flatMap((f) =>
    cited(readFileSync(f, 'utf8')).filter((d) => !existsSync(d)).map((d) => `${f}: ${d}`))
  assert.deepEqual(missing, [])
})
