// Slice 1 — the schema the availability rules stand on.
// D-11, D-27, C-07, IR-1, ID-04, PR-10.

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { connect, loadFixture, loadRoster, asTenant, TENANT_A } from './helpers/db.mjs'

let db

before(async () => {
  db = await connect()
  await loadFixture(db)
  await loadRoster(db)
})
after(async () => { await db?.end() })

async function inRollback(fn) {
  await db.query('BEGIN')
  try { return await fn() } finally { await db.query('ROLLBACK') }
}

describe('D-11 · the identity ladder', () => {
  test('four rungs, and nothing outside them', async () => {
    const { rows } = await db.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'actors'::regclass
         AND pg_get_constraintdef(oid) LIKE '%identity_rung%'`)
    for (const rung of ['identified', 'ghost', 'guest', 'inferred']) {
      assert.ok(rows.some((r) => r.def.includes(rung)), `rung "${rung}" missing`)
    }

    let rejected = false
    await inRollback(async () => {
      try {
        await db.query(`
          INSERT INTO actors (org_id, actor_type, display_id, identity_rung)
          VALUES ($1, 'user', 'X-1', 'anonymous')`, [TENANT_A])
      } catch (e) { rejected = /identity_rung/.test(e.message) }
    })
    assert.ok(rejected, 'a fifth rung was accepted')
  })

  test('`identified BOOLEAN` did not survive alongside it', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_name = 'actors' AND column_name = 'identified'`)
    assert.deepEqual(rows, [],
      'two answers to the same question: identified and identity_rung')
  })

  // A ghost is pseudonymised, not anonymised. The schema should not permit a
  // name on a rung the ladder says cannot be named.
  test('an unnameable rung cannot carry a name', async () => {
    for (const rung of ['ghost', 'guest', 'inferred']) {
      let rejected = false
      await inRollback(async () => {
        try {
          await db.query(`
            INSERT INTO actors (org_id, actor_type, display_id, display_name,
                                identity_rung)
            VALUES ($1, 'user', 'X-' || $2, 'Real Name', $2)`, [TENANT_A, rung])
        } catch (e) { rejected = /unnameable_has_no_name/.test(e.message) }
      })
      assert.ok(rejected, `a "${rung}" actor was given a display_name`)
    }
  })

  test('display_id is always present, on every rung', async () => {
    const { rows } = await db.query(
      'SELECT count(*)::int AS n FROM actors WHERE display_id IS NULL')
    assert.equal(rows[0].n, 0)
  })
})

describe('D-27 · ASA instance counts', () => {
  test('instance counts exist and belong only to ASA deployments', async () => {
    let rejected = false
    await inRollback(async () => {
      try {
        await db.query(`
          INSERT INTO actors (org_id, actor_type, display_id, identity_rung,
                              instances_total, instances_live)
          VALUES ($1, 'human', 'AG-9999', 'identified', 4, 3)`, [TENANT_A])
      } catch (e) { rejected = /instances_are_asa_only/.test(e.message) }
    })
    assert.ok(rejected, 'a person was given an instance count')
  })

  test('live instances cannot exceed provisioned instances', async () => {
    let rejected = false
    await inRollback(async () => {
      try {
        await db.query(`
          INSERT INTO actors (org_id, actor_type, display_id, identity_rung,
                              instances_total, instances_live)
          VALUES ($1, 'asa', 'ASA-BAD-01', 'inferred', 2, 5)`, [TENANT_A])
      } catch (e) { rejected = /instances_coherent/.test(e.message) }
    })
    assert.ok(rejected, 'more instances were live than were provisioned')
  })
})

describe('C-07 · channel_actor_mix', () => {
  test('the table carries present and no share or bias column', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'channel_actor_mix'`)
    const cols = new Set(rows.map((r) => r.column_name))

    assert.ok(cols.has('present'), 'channel_actor_mix has no present column')
    for (const forbidden of ['share', 'bias', 'weight', 'proportion']) {
      assert.ok(!cols.has(forbidden),
        `"${forbidden}" exists. Attribution reads the observed split from ` +
        'proj_metric_counts; multiplying that by an assumed split ' +
        'double-counts. A column nobody may use is a column somebody will.')
    }
  })

  test('all four actor types are representable, including ARep', async () => {
    await inRollback(async () => {
      for (const t of ['user', 'asa', 'human', 'arep']) {
        await db.query(`
          INSERT INTO channel_actor_mix (org_id, channel_id, actor_type, present)
          VALUES ($1, 'aaaaaaaa-2222-4000-8000-00000000000b', $2, true)
          ON CONFLICT (org_id, channel_id, actor_type)
          DO UPDATE SET present = true`, [TENANT_A, t])
      }
    })
  })

  // PR-10, at the configuration layer. These are different answers and the
  // interface has to be able to tell a user which one it is.
  test('a missing row and present = false are distinguishable', async () => {
    const { rows } = await db.query(`
      SELECT
        (SELECT count(*)::int FROM channel_actor_mix
          WHERE org_id = $1 AND actor_type = 'arep')  AS arep_rows,
        (SELECT count(*)::int FROM channel_actor_mix
          WHERE org_id = $1 AND actor_type = 'human' AND NOT present) AS human_false`,
      [TENANT_A])

    assert.equal(rows[0].arep_rows, 0, 'ARep should be undeclared in the fixture')
    assert.ok(rows[0].human_false > 0, 'no channel declares humans absent')
  })
})

describe('IR-1 / ID-04 · pseudonymity is a property of the schema', () => {
  test('v_roster exposes no member name', async () => {
    const { rows } = await db.query(`
      SELECT actor_type, display_id, display_name FROM v_roster
       WHERE org_id = $1 AND actor_type = 'user'`, [TENANT_A])

    assert.ok(rows.length > 0, 'no member actors in the fixture')
    for (const r of rows) {
      assert.equal(r.display_name, null,
        `v_roster exposed a name for ${r.display_id}`)
      assert.ok(r.display_id, 'a member has no display_id to drill down on')
    }
  })

  test('the underlying row still holds the name, so reveal remains possible later', async () => {
    // The name is not deleted. When ID-04's audit path exists the reveal
    // becomes a separate logged read rather than a schema change.
    const { rows } = await db.query(`
      SELECT display_name FROM actors
       WHERE org_id = $1 AND display_id = 'MBR-20440'`, [TENANT_A])
    assert.equal(rows[0].display_name, 'Member Name')
  })

  test('human and ASA actors are legitimately observable', async () => {
    const { rows } = await db.query(`
      SELECT count(*) FILTER (WHERE display_name IS NOT NULL)::int AS named
        FROM v_roster WHERE org_id = $1 AND actor_type = 'human'`, [TENANT_A])
    assert.ok(rows[0].named > 0,
      'the roster is unnameable, so twenty-nine available is not auditable')
  })

  test('v_roster obeys row-level security', async () => {
    const seen = await asTenant(db, TENANT_A, async () => {
      const { rows } = await db.query('SELECT DISTINCT org_id FROM v_roster')
      return rows
    })
    assert.equal(seen.length, 1)
    assert.equal(seen[0].org_id, TENANT_A)
  })
})

describe('the availability functions cannot bypass tenancy', () => {
  test('no availability function is SECURITY DEFINER', async () => {
    const { rows } = await db.query(`
      SELECT proname FROM pg_proc p
       JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public'
         AND p.proname LIKE 'bob_availability%'
         AND p.prosecdef`)
    assert.deepEqual(rows.map((r) => r.proname), [],
      'a SECURITY DEFINER availability function bypasses RLS and would hand ' +
      "one tenant another tenant's roster")
  })

  test('v_roster is security_invoker', async () => {
    const { rows } = await db.query(`
      SELECT reloptions FROM pg_class WHERE relname = 'v_roster'`)
    assert.ok(
      (rows[0].reloptions || []).some((o) => o === 'security_invoker=true'),
      'v_roster runs as its owner and would bypass RLS',
    )
  })
})
