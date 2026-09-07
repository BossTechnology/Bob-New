// FR-20, FR-21, FR-22, FR-23 — availability.
//
// FR-20 is the single most important rule in the acceptance suite. Summing
// instead of de-duplicating overstates capacity by 65% on the simulator's own
// roster, and nothing looks broken: response time targets, escalation policy
// and staffing decisions all inherit the error silently.

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { connect, loadFixture, loadRoster, asTenant, TENANT_A, TENANT_B } from './helpers/db.mjs'

let db

// A fixed clock. Shifts run 08:00–18:00 on 2026-09-03 and every assertion
// evaluates at noon. A fixture whose answer depends on when CI happens to run
// is a fixture that goes red at midnight for no reason.
const AT = '2026-09-03T12:00:00Z'
const BEFORE_SHIFT = '2026-09-03T06:00:00Z'
const AFTER_SHIFT = '2026-09-03T20:00:00Z'

const WHATSAPP = 'aaaaaaaa-2222-4000-8000-000000000001'
const VOICE = 'aaaaaaaa-2222-4000-8000-00000000000a'
const WEBSITE = 'aaaaaaaa-2222-4000-8000-00000000000b'
const HUMAN_CHANNELS = [WHATSAPP, VOICE]

before(async () => {
  db = await connect()
  await loadFixture(db)
  await loadRoster(db)
})
after(async () => { await db?.end() })

async function availability(channels, opts = {}) {
  const { rows } = await db.query(
    `SELECT * FROM bob_availability($1, $2, $3, $4, $5, $6)`,
    [TENANT_A, channels, opts.volume ?? null, opts.window ?? null,
      opts.duration ?? null, opts.at ?? AT])
  return Object.fromEntries(rows.map((r) => [r.actor_type, r]))
}

describe('FR-20 · human availability counts distinct actors, never a sum', () => {
  test('the roster gives 29 available against a per-channel sum of 39', async () => {
    const { rows } = await db.query(
      `SELECT bob_availability_human($1, $2, $3)        AS distinct_count,
              bob_availability_human_summed($1, $2, $3) AS summed`,
      [TENANT_A, HUMAN_CHANNELS, AT])

    assert.equal(rows[0].distinct_count, 29)

    // The assertion that matters more than the number. A roster with no
    // multi-skilled agents produces sum == distinct, and would pass a bare
    // "equals 29" test against a completely wrong implementation.
    assert.ok(
      rows[0].summed > rows[0].distinct_count,
      `the fixture cannot expose the summing defect: sum ${rows[0].summed} ` +
      `is not greater than distinct ${rows[0].distinct_count}. Fix the ` +
      'fixture, not this test.',
    )
  })

  test('availability over two channels is less than the two single-channel figures added', async () => {
    const { rows } = await db.query(
      `SELECT bob_availability_human($1, ARRAY[$2]::uuid[], $4) AS wa,
              bob_availability_human($1, ARRAY[$3]::uuid[], $4) AS voice,
              bob_availability_human($1, ARRAY[$2,$3]::uuid[], $4) AS both`,
      [TENANT_A, WHATSAPP, VOICE, AT])

    const { wa, voice, both } = rows[0]
    assert.ok(both < wa + voice,
      `agents are a shared pool: ${both} should be less than ${wa} + ${voice}`)
    assert.equal(both, 29)
  })

  test('an agent on break inside a live window is not available', async () => {
    // AG-1099 sits inside 08:00–18:00 with status 'break'. If liveness were
    // read off the clock alone this agent would be counted.
    const { rows } = await db.query(
      `SELECT count(*)::int AS n FROM actors
        WHERE org_id = $1 AND display_id = 'AG-1099'`, [TENANT_A])
    assert.equal(rows[0].n, 1, 'the on-break fixture agent is missing')

    const { rows: avail } = await db.query(
      'SELECT bob_availability_human($1, $2, $3) AS n',
      [TENANT_A, HUMAN_CHANNELS, AT])
    assert.equal(avail[0].n, 29, 'an agent on break was counted as available')
  })
})

describe('D-26 · liveness is derived, never stored', () => {
  test('nobody is available before the shift starts or after it ends', async () => {
    for (const at of [BEFORE_SHIFT, AFTER_SHIFT]) {
      const { rows } = await db.query(
        'SELECT bob_availability_human($1, $2, $3) AS n',
        [TENANT_A, HUMAN_CHANNELS, at])
      assert.equal(rows[0].n, 0, `agents were available at ${at}`)
    }
  })

  // The reason the ruling was made. Under a stored flag this is the moment
  // availability silently reports people who went home.
  test('a shift going stale changes the answer with no row updated', async () => {
    const during = await db.query(
      'SELECT bob_availability_human($1, $2, $3) AS n',
      [TENANT_A, HUMAN_CHANNELS, '2026-09-03T17:59:00Z'])
    const after = await db.query(
      'SELECT bob_availability_human($1, $2, $3) AS n',
      [TENANT_A, HUMAN_CHANNELS, '2026-09-03T18:01:00Z'])

    assert.equal(during.rows[0].n, 29)
    assert.equal(after.rows[0].n, 0)
  })

  test("'live' is not a storable shift status", async () => {
    const { rows } = await db.query(`
      SELECT pg_get_constraintdef(oid) AS def FROM pg_constraint
       WHERE conrelid = 'actor_shifts'::regclass AND contype = 'c'
         AND pg_get_constraintdef(oid) LIKE '%status%'`)
    assert.ok(rows.length > 0, 'actor_shifts has no status constraint')
    assert.ok(!/'live'/.test(rows[0].def),
      "'live' survives in the stored set and will contradict the derived value")
  })
})

describe('FR-21 · ASA availability does not vary with timeframe', () => {
  test('ASA is a sum of live instances, not a count of deployments', async () => {
    // WhatsApp: ASA-WHAT-01 live 3, ASA-WHAT-02 live 1. Voice: ASA-VOIC-01
    // live 2. Four deployments across the selection would be 3; instances are 6.
    const { rows } = await db.query(
      'SELECT bob_availability_asa($1, $2) AS n', [TENANT_A, HUMAN_CHANNELS])
    assert.equal(rows[0].n, 6)
  })

  test('the function takes no timeframe, so FR-21 holds structurally', async () => {
    const { rows } = await db.query(`
      SELECT pg_get_function_identity_arguments(oid) AS args
        FROM pg_proc WHERE proname = 'bob_availability_asa'`)
    assert.ok(!/timestamp/i.test(rows[0].args),
      'bob_availability_asa accepts a time argument, so the figure could vary')
  })

  test('the figure is unchanged across four timeframes', async () => {
    const figures = []
    for (const at of [BEFORE_SHIFT, AT, AFTER_SHIFT, '2026-12-25T03:00:00Z']) {
      const a = await availability(HUMAN_CHANNELS, { at })
      figures.push(a.asa.available)
    }
    assert.deepEqual(figures, [6, 6, 6, 6])
  })
})

describe('FR-22 · user availability is concurrency', () => {
  // STATED GAP: both inputs come from the projection layer, which does not
  // exist until Slice 2. Verified in formula; unverified end to end.
  test('the formula is volume ÷ window × average duration', async () => {
    const { rows } = await db.query(
      'SELECT bob_availability_user($1, $2, $3) AS n', [600, 60, 13])
    assert.equal(rows[0].n, 130) // 600/60 = 10 per minute × 13 minutes
  })

  test('the figure falls as the window widens at a constant arrival rate', async () => {
    // Constant arrival: 10 per minute. Concurrency must not change.
    const constant = []
    for (const [volume, window] of [[600, 60], [14400, 1440], [100800, 10080]]) {
      const { rows } = await db.query(
        'SELECT bob_availability_user($1, $2, $3) AS n', [volume, window, 13])
      constant.push(rows[0].n)
    }
    assert.deepEqual(constant, [130, 130, 130],
      'concurrency changed while the arrival rate was constant')

    // Same volume, wider window — the rule as the acceptance criterion states it.
    const falling = []
    for (const window of [60, 1440, 10080]) {
      const { rows } = await db.query(
        'SELECT bob_availability_user($1, $2, $3) AS n', [600, window, 13])
      falling.push(rows[0].n)
    }
    assert.ok(falling[0] > falling[1] && falling[1] > falling[2],
      `figure did not fall as the window widened: ${falling.join(', ')}`)
  })

  // PR-10. A zero would claim nobody is on the site, which is a different and
  // false statement from "we have not been told".
  test('absent inputs give an absent figure, not zero', async () => {
    for (const args of [[null, 60, 13], [600, null, 13], [600, 60, null], [600, 0, 13]]) {
      const { rows } = await db.query(
        'SELECT bob_availability_user($1, $2, $3) AS n', args)
      assert.equal(rows[0].n, null, `${JSON.stringify(args)} produced a number`)
    }
  })
})

describe('FR-23 · a zero figure is accompanied by why', () => {
  test('a website only: the human cell explains that none carry humans', async () => {
    const a = await availability([WEBSITE])
    assert.equal(a.human.available, 0)
    assert.equal(a.human.reason, 'no_channels_carry_actor_type')
  })

  test('the ASA figure on a website is present, not zero', async () => {
    // A static channel is an ASA. Its service agent does not converse, and it
    // is still a service agent.
    const a = await availability([WEBSITE])
    assert.equal(a.asa.available, 2)
    assert.equal(a.asa.reason, null)
  })

  test('a live figure carries no reason', async () => {
    const a = await availability(HUMAN_CHANNELS)
    assert.equal(a.human.available, 29)
    assert.equal(a.human.reason, null)
  })

  test('off-shift is a different answer from no human channels', async () => {
    const a = await availability(HUMAN_CHANNELS, { at: AFTER_SHIFT })
    assert.equal(a.human.available, 0)
    assert.equal(a.human.reason, 'none_on_shift',
      'a rota problem was reported as a staffing plan problem')
  })

  // PR-10 one level up: nobody has declared whether these channels carry ARep.
  test('not declared is a different answer from declared absent', async () => {
    const { rows } = await db.query(
      `SELECT bob_availability_reason($1, $2, 'arep', $3) AS r`,
      [TENANT_A, HUMAN_CHANNELS, AT])
    assert.equal(rows[0].r, 'mix_not_declared')

    const { rows: declared } = await db.query(
      `SELECT bob_availability_reason($1, ARRAY[$2]::uuid[], 'human', $3) AS r`,
      [TENANT_A, WEBSITE, AT])
    assert.equal(declared.rows === undefined ? declared[0].r : declared[0].r,
      'no_channels_carry_actor_type')
  })

  test('an empty selection says so rather than reporting zero', async () => {
    const a = await availability([])
    assert.equal(a.human.reason, 'no_channels_selected')
    assert.equal(a.asa.reason, 'no_channels_selected')
  })
})

describe('the availability path respects the tenant boundary', () => {
  test("tenant B's roster does not reach tenant A's figure", async () => {
    // B has three live agents on its own channel. If the path leaked, A's 29
    // would move — which is why the two rosters are deliberately unequal.
    const seen = await asTenant(db, TENANT_A, async () => {
      const { rows } = await db.query(
        'SELECT bob_availability_human($1, $2, $3) AS n',
        [TENANT_A, HUMAN_CHANNELS, AT])
      return rows[0].n
    })
    assert.equal(seen, 29)
  })

  test("asking for another tenant's availability returns nothing", async () => {
    const seen = await asTenant(db, TENANT_A, async () => {
      const { rows } = await db.query(
        'SELECT bob_availability_human($1, $2, $3) AS n',
        [TENANT_B, ['bbbbbbbb-2222-4000-8000-000000000002'], AT])
      return rows[0].n
    })
    assert.equal(seen, 0, "tenant A read tenant B's roster")
  })
})
