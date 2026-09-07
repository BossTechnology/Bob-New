// The simulator's backend bridge is a real consumer of /api/config/autobotz.
//
// It was missed when the table was renamed. The handoff said three route files
// changed; there were four consumers. CI stayed green because the suite covered
// schema, tenancy and availability, and nothing looked at public/.
//
// This closes that. It reads the actual column list from the database and
// asserts the bridge names nothing that no longer exists — so the next rename
// fails here rather than at runtime, in a file nobody thought to open.

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { connect, REPO_ROOT } from './helpers/db.mjs'

let db
let bridge

before(async () => {
  db = await connect()
  const html = readFileSync(join(REPO_ROOT, 'public/dashboard.html'), 'utf8')

  // Only the bridge section. The simulator's own in-memory model legitimately
  // uses its own field names — `ref`, `scope` — and constraining those would be
  // porting the simulator, which C-10 rules out.
  const start = html.indexOf('BOb Backend Bridge')
  assert.ok(start > 0, 'the backend bridge section has moved or been removed')
  bridge = html.slice(start)
})

after(async () => { await db?.end() })

describe('the simulator bridge matches the autobotz schema', () => {
  test('it names no column that was renamed away', async () => {
    // The left side is what the bridge would have sent before the rename.
    const superseded = {
      'client_id': 'dropped (D-21)',
      'row.ref': 'now row.reference',
      'row.config': 'now row.binding',
      'row.verify_ts': 'now row.verified_at',
      'row.scope': 'now row.scope_kind',
    }

    const found = []
    for (const [name, fix] of Object.entries(superseded)) {
      // Word-boundary matched, not substring: `row.ref` must not fire on
      // `row.reference`, and `row.scope` must not fire on `row.scope_kind`.
      // An underscore is a word character, so \b handles the second case too.
      const re = new RegExp(name.replace(/[.]/g, '\\.') + '\\b')
      // Ignore comment lines: the fix is explained in prose beside the code.
      const hit = bridge.split('\n').some(
        (l) => !l.trimStart().startsWith('//') && re.test(l))
      if (hit) found.push(`${name} — ${fix}`)
    }

    assert.deepEqual(found, [],
      'the bridge sends or reads columns that no longer exist:\n  ' +
      found.join('\n  '))
  })

  test('every column the bridge sends exists on the table', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'autobotz'`)
    const columns = new Set(rows.map((r) => r.column_name))

    // The payload built by _abBody. If this list and the function drift apart,
    // the next test catches it; this one catches drift against the database.
    const sends = ['type', 'label', 'provider', 'scope_kind', 'reference',
      'binding', 'mutative', 'requires_approval']

    const missing = sends.filter((c) => !columns.has(c))
    assert.deepEqual(missing, [],
      `the bridge sends columns that do not exist: ${missing.join(', ')}`)

    for (const c of sends) {
      assert.ok(bridge.includes(c + ':'),
        `_abBody no longer sends "${c}" — update this list or fix the bridge`)
    }
  })

  // BR-3 is enforced by a NOT VALID constraint, so an unruled binding is
  // refused on insert. A bridge that omits the field turns that into a silent
  // 400 the user sees as "save didn't work".
  test('it refuses to send a binding with no BR-3 ruling', async () => {
    assert.match(bridge, /typeof ab\.mutative\s*!==\s*'boolean'/,
      'persistAB no longer guards on the mutative ruling')
  })
})
