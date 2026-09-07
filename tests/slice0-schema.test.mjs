// Slice 0 — what the four migrations must be true of.
//
// SR-1, SR-2, PR-9, R-01, R-02, R-03, BR-3/D-10, D-16, D-18, D-19.

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { connect, loadFixture, TENANT_A } from './helpers/db.mjs'

let db

before(async () => {
  db = await connect()
  await loadFixture(db)
})
after(async () => { await db?.end() })

// Everything below writes inside a transaction and rolls back.
async function inRollback(fn) {
  await db.query('BEGIN')
  try { return await fn() } finally { await db.query('ROLLBACK') }
}

describe('SR-1 · the tenant slug', () => {
  test('a slug that cannot be a bzzz.tenant tag is rejected', async () => {
    for (const bad of ['Tenant A', 'tenant_a', '-leading', 'trailing-', 'UPPER']) {
      let rejected = false
      await inRollback(async () => {
        try {
          await db.query(
            `INSERT INTO organizations (name, slug) VALUES ('X', $1)`, [bad])
        } catch (e) {
          rejected = /organizations_slug_shape/.test(e.message)
        }
      })
      assert.ok(rejected, `slug "${bad}" was accepted and should not have been`)
    }
  })

  test('a slug is correctable before telemetry exists under it', async () => {
    await inRollback(async () => {
      await db.query(
        `UPDATE organizations SET slug = 'tenant-a-corrected' WHERE id = $1`,
        [TENANT_A])
      const { rows } = await db.query(
        'SELECT slug FROM organizations WHERE id = $1', [TENANT_A])
      assert.equal(rows[0].slug, 'tenant-a-corrected')
    })
  })

  test('a slug is frozen once telemetry exists under it', async () => {
    let rejected = false
    await inRollback(async () => {
      await db.query(
        `UPDATE organizations SET telemetry_started_at = now() WHERE id = $1`,
        [TENANT_A])
      try {
        await db.query(
          `UPDATE organizations SET slug = 'renamed' WHERE id = $1`, [TENANT_A])
      } catch (e) {
        rejected = /immutable once telemetry/.test(e.message)
      }
    })
    assert.ok(rejected, 'a live tenant could be renamed with an UPDATE')
  })

  // The gate is only a gate if the gate itself is protected.
  test('the telemetry marker cannot be cleared to unfreeze the slug', async () => {
    let rejected = false
    await inRollback(async () => {
      await db.query(
        `UPDATE organizations SET telemetry_started_at = now() WHERE id = $1`,
        [TENANT_A])
      try {
        await db.query(
          `UPDATE organizations SET telemetry_started_at = NULL WHERE id = $1`,
          [TENANT_A])
      } catch (e) {
        rejected = /set once and never changed/.test(e.message)
      }
    })
    assert.ok(rejected, 'the immutability gate could be stepped around')
  })
})

describe('SR-2 · the channel source key', () => {
  test('source_key is unique within an org and free across orgs', async () => {
    await inRollback(async () => {
      // Same key, different tenant — allowed.
      await db.query(`
        INSERT INTO channels (org_id, channel_type, display_name, source_key)
        VALUES ('bbbbbbbb-0000-4000-8000-000000000002', 'whatsapp', 'B WA',
                'tenant-a.whatsapp')`)
    })

    let rejected = false
    await inRollback(async () => {
      try {
        await db.query(`
          INSERT INTO channels (org_id, channel_type, display_name, source_key)
          VALUES ($1, 'chat', 'Duplicate', 'tenant-a.whatsapp')`, [TENANT_A])
      } catch (e) {
        rejected = /channels_source_key_unique/.test(e.message)
      }
    })
    assert.ok(rejected, 'two channels in one org shared a source key')
  })

  // "Configured but not yet emitting" must be distinguishable from "emitting
  // zero", or the first deployment looks broken and nobody can tell why.
  test('the unset state is detectable through one shared definition', async () => {
    const { rows } = await db.query(`
      SELECT display_name, bob_source_key_unset(source_key) AS unset
        FROM channels ORDER BY display_name`)
    const byName = Object.fromEntries(rows.map((r) => [r.display_name, r.unset]))
    assert.equal(byName['WhatsApp'], false, 'a configured channel read as unset')
    assert.equal(byName['Voice'], true, 'an unconfigured channel read as configured')
  })
})

describe('PR-9 / D-25 · declared lag, and the absence of one', () => {
  // Zero is not the absence of a declaration. It is a declaration that the
  // channel is live. A default of zero would assert that about every channel
  // nobody has checked — in the column that decides whether a threshold may
  // evaluate against an open bucket (PR-7).
  test('lag_seconds is nullable and carries no default', async () => {
    const { rows } = await db.query(`
      SELECT is_nullable, column_default FROM information_schema.columns
       WHERE table_name = 'channels' AND column_name = 'lag_seconds'`)
    assert.equal(rows[0].is_nullable, 'YES',
      'a channel must be able to have no lag declaration')
    assert.equal(rows[0].column_default, null,
      'a default here declares liveness on behalf of channels nobody checked')
  })

  test('undeclared is distinguishable from declared-live', async () => {
    await inRollback(async () => {
      await db.query(`
        INSERT INTO channels (org_id, channel_type, display_name, source_key,
                              lag_seconds)
        VALUES ($1, 'chat', 'Undeclared', 'undeclared-1', NULL),
               ($1, 'chat', 'Live',       'live-1',       0)`, [TENANT_A])

      const { rows } = await db.query(`
        SELECT display_name, lag_seconds FROM channels
         WHERE display_name IN ('Undeclared','Live') ORDER BY display_name`)

      assert.equal(rows[0].lag_seconds, 0,    'a declared-live channel lost its zero')
      assert.equal(rows[1].lag_seconds, null, 'an undeclared channel was defaulted')
    })
  })
})

describe('F-08 · a website is a channel type', () => {
  // An ASA is any artificial agent providing service on the business side —
  // including a website. Folding it into `forms` or `app` would make three
  // distinct surfaces report as one, visibly, with no way back.
  test('website is accepted', async () => {
    await inRollback(async () => {
      await db.query(`
        INSERT INTO channels (org_id, channel_type, display_name, source_key)
        VALUES ($1, 'website', 'Marketing site', 'site-1')`, [TENANT_A])
    })
  })

  test('the rest of the permitted set survived the constraint replacement', async () => {
    for (const t of ['bot','whatsapp','voice','app','forms','email',
      'social','retail','google','tickets','chat','reddit']) {
      await inRollback(async () => {
        await db.query(`
          INSERT INTO channels (org_id, channel_type, display_name, source_key)
          VALUES ($1, $2, 'X', 'x-' || $2)`, [TENANT_A, t])
      })
    }
  })

  test('an invented channel type is still refused', async () => {
    let rejected = false
    await inRollback(async () => {
      try {
        await db.query(`
          INSERT INTO channels (org_id, channel_type, display_name, source_key)
          VALUES ($1, 'carrier_pigeon', 'X', 'x-1')`, [TENANT_A])
      } catch (e) { rejected = /channel_type/.test(e.message) }
    })
    assert.ok(rejected, 'the channel_type constraint no longer constrains')
  })
})

describe('R-01, R-02, R-03 · the autobotz corrections', () => {
  test('the old table name survives nowhere', async () => {
    const { rows } = await db.query(`
      SELECT 'table' AS kind, c.relname AS name
        FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = 'public' AND c.relname LIKE '%autobotz_bindings%'
      UNION ALL
      SELECT 'constraint', conname FROM pg_constraint
       WHERE conname LIKE '%autobotz_bindings%'
      UNION ALL
      SELECT 'policy', policyname FROM pg_policies
       WHERE schemaname = 'public' AND policyname LIKE '%autobotz_bindings%'`)
    assert.deepEqual(
      rows, [],
      'artefacts still carry the pre-rename name:\n' +
        rows.map((r) => `  ${r.kind} ${r.name}`).join('\n'),
    )
  })

  test('autobotz carries the Data Model §3.4 columns', async () => {
    const { rows } = await db.query(`
      SELECT column_name FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'autobotz'`)
    const cols = new Set(rows.map((r) => r.column_name))

    for (const c of ['reference', 'binding', 'verified_at', 'scope_kind',
      'scope_ref', 'enabled', 'rate_limit_per_hour', 'concurrency_limit',
      'invocation_cap_daily', 'requires_approval', 'mutative']) {
      assert.ok(cols.has(c), `autobotz is missing §3.4 column "${c}"`)
    }
    for (const c of ['ref', 'config', 'verify_ts', 'scope', 'client_id']) {
      assert.ok(!cols.has(c), `autobotz still carries superseded column "${c}"`)
    }
  })

  // D-20. The column is open by §3.4 — a customer's own vendor is a provider.
  test('provider is an open column with the corrected default', async () => {
    const { rows: checks } = await db.query(`
      SELECT conname FROM pg_constraint
       WHERE conrelid = 'autobotz'::regclass AND contype = 'c'
         AND pg_get_constraintdef(oid) ILIKE '%provider%'`)
    assert.deepEqual(checks, [], 'provider is constrained to a closed set')

    await inRollback(async () => {
      await db.query(`
        INSERT INTO autobotz (org_id, type, label, reference, provider, mutative)
        VALUES ($1, 'rpa', 'Named vendor', 'job-1', 'uipath', false)`, [TENANT_A])
    })

    const { rows } = await db.query(`
      SELECT column_default FROM information_schema.columns
       WHERE table_name = 'autobotz' AND column_name = 'provider'`)
    assert.match(rows[0].column_default, /'bzzzbx'/)
  })

  // R-03. RS-30 has four states; stale is derived (RS-31), so three are stored.
  test('verify_state stores three states and pending is not one of them', async () => {
    const { rows } = await db.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'autobotz'::regclass
         AND conname = 'autobotz_verify_state_check'`)
    assert.ok(!/pending/.test(rows[0].def), "'pending' survives in verify_state")
    for (const s of ['unverified', 'ok', 'failed']) {
      assert.match(rows[0].def, new RegExp(s))
    }
  })
})

describe('BR-3 / D-10 · a binding cannot be registered without a mutative ruling', () => {
  test('an insert omitting the ruling is refused', async () => {
    let rejected = false
    await inRollback(async () => {
      try {
        await db.query(`
          INSERT INTO autobotz (org_id, type, label, reference)
          VALUES ($1, 'synthetics', 'Unruled probe', 'p-1')`, [TENANT_A])
      } catch (e) {
        rejected = /autobotz_mutative_declared/.test(e.message)
      }
    })
    assert.ok(rejected, 'a binding was registered with no BR-3 ruling')
  })

  test('the flag has no default, so nothing is asserted on anyone\'s behalf', async () => {
    const { rows } = await db.query(`
      SELECT column_default FROM information_schema.columns
       WHERE table_name = 'autobotz' AND column_name = 'mutative'`)
    assert.equal(rows[0].column_default, null)
  })
})

describe('D-16 · adapter_kind', () => {
  test('the four capture methods are accepted and nothing else is', async () => {
    for (const kind of ['native_otel', 'signal_maker', 'external', 'synthetic']) {
      await inRollback(async () => {
        await db.query(`
          INSERT INTO channels (org_id, channel_type, display_name, source_key,
                                adapter_kind)
          VALUES ($1, 'chat', 'K', 'k-' || $2, $2)`, [TENANT_A, kind])
      })
    }

    let rejected = false
    await inRollback(async () => {
      try {
        await db.query(`
          INSERT INTO channels (org_id, channel_type, display_name, source_key,
                                adapter_kind)
          VALUES ($1, 'chat', 'Bad', 'bad-1', 'synthetics')`, [TENANT_A])
      } catch (e) {
        rejected = /adapter_kind/.test(e.message)
      }
    })
    assert.ok(
      rejected,
      "autobotz.type 'synthetics' was accepted as a capture method — the two " +
      'are different things wearing the same word (D-16)',
    )
  })
})
