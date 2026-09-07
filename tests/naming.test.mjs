// Product names are precise and case-sensitive, in schema values too.
//
// 'bzzzbox' reached a CHECK constraint and a DEFAULT and stayed there. This is
// the cheapest possible guard against the next one, and it is permanent.
//
// The correcting migration is exempt: it contains the misspelling by necessity,
// because it is the migration that removes it.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'
import { REPO_ROOT } from './helpers/db.mjs'

// `public/` was skipped here to avoid scanning build output, and it cost us:
// public/dashboard.html carried 'bzzzbox' six times, including in the payload
// its backend bridge POSTs to /api/config/autobotz. D-20 removed the provider
// CHECK on the argument that this test covered the whole repository. It did
// not. Skipping a directory is how a guard acquires a hole in exactly the place
// the defect lives, so `public` is scanned and build output is excluded by
// extension instead.
const SKIP_DIRS = new Set([
  'node_modules', '.git', '.next', 'dist', 'build', 'coverage',
])
const SCAN_EXT = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.sql', '.json', '.md',
  '.yml', '.yaml', '.toml', '.css', '.html',
])

// Files that must contain a forbidden spelling in order to do their job.
//
// The 20260830 migration is applied history: it is what was actually deployed,
// and rewriting it would make the chain stop matching production. The 20260902
// migration is the correction and necessarily names what it corrects. Neither
// is a live use of the misspelling — the value in the database after the chain
// runs is 'bzzzbx', which is what the schema tests assert.
const EXEMPT = new Set([
  'supabase/migrations/20260830100000_autobotz_bindings.sql',
  'supabase/migrations/20260902100000_autobotz_rename_and_align.sql',
  'tests/naming.test.mjs',
  'tests/service-role-allowlist.json',
  'Documentation/contract-amendments.md',
  'package-lock.json',
])

const FORBIDDEN = [
  { pattern: /bzzzbox/gi,    correct: 'BzzzBX / bzzzbx' },
  { pattern: /\bBuzzBox\b/gi, correct: 'BzzzBX' },
  { pattern: /\bBOB\b/g,      correct: 'BOb' },
  { pattern: /\bChassis\b/gi, correct: 'CHASS1S' },
  { pattern: /\bBobee\b/g,    correct: 'BObee' },
  { pattern: /\bAutobotz\b/g, correct: 'AutoBotz' },
  { pattern: /\bAutocomm\b/g, correct: 'AutoComm' },
]

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) walk(full, out)
    else if (SCAN_EXT.has(extname(entry))) out.push(full)
  }
  return out
}

describe('product naming is case-sensitive, including in schema values', () => {
  test('no forbidden spelling appears anywhere in the repository', () => {
    const hits = []

    for (const file of walk(REPO_ROOT)) {
      const rel = relative(REPO_ROOT, file)
      if (EXEMPT.has(rel)) continue

      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        for (const { pattern, correct } of FORBIDDEN) {
          pattern.lastIndex = 0
          const m = pattern.exec(line)
          if (m) hits.push(`${rel}:${i + 1}  "${m[0]}" — should be ${correct}`)
        }
      })
    }

    assert.deepEqual(hits, [], `forbidden spellings:\n  ${hits.join('\n  ')}`)
  })
})
