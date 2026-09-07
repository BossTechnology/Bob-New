-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · Slice 1 roster fixture — the FR-20 known answer.
--
-- NOT A MIGRATION. Loaded by the suite into a database already carrying
-- two_orgs.sql.
--
-- This reproduces buildHumanRoster() from the simulator rather than inventing a
-- roster that happens to give 29. The construction is what matters: a roster
-- with no multi-skilled agents cannot expose the summing bug, so it would pass
-- the FR-20 test while proving nothing.
--
--   34 agents, AG-1040 to AG-1073
--   live where i % 7 <> 0            → 5 off shift, 29 live
--   second channel where i % 3 = 0   → multi-skilled agents, so the sum > 29
--
-- Both tenants get a roster. Tenant B's is deliberately different so that a
-- tenancy leak in the availability path changes tenant A's answer, rather than
-- hiding behind two identical numbers.
-- ════════════════════════════════════════════════════════════════════════════

-- ── Channels ────────────────────────────────────────────────────────────────
-- Tenant A already has 'WhatsApp' from two_orgs.sql. Add Voice and a static
-- channel. The static channel is what makes FR-23 testable: it carries an ASA
-- and no humans, which is the exact scenario the rule names.
--
-- The static channel is a website, the case the Product Document names
-- explicitly (F-08, ruled). It carries an ASA and no humans, which is exactly
-- the scenario FR-23 exists for.
INSERT INTO channels (id, org_id, channel_type, display_name, source_key,
                      lag_seconds, adapter_kind) VALUES
  ('aaaaaaaa-2222-4000-8000-00000000000a',
   'aaaaaaaa-0000-4000-8000-000000000001', 'voice', 'Voice',
   'tenant-a.voice', 900, 'signal_maker'),   -- declared: facts arrive late
  ('aaaaaaaa-2222-4000-8000-00000000000b',
   'aaaaaaaa-0000-4000-8000-000000000001', 'website', 'Website',
   'tenant-a.web', NULL, 'native_otel');    -- D-25: lag UNDECLARED

-- ── The mix ─────────────────────────────────────────────────────────────────
-- WhatsApp and Voice carry humans, ASAs and users. The website carries an ASA
-- and users and NO humans — a static channel is an ASA, and its service agent
-- does not converse, but it is still a service agent.
--
-- Note what is deliberately ABSENT: no 'arep' row anywhere. A missing row is
-- "not declared", which is a different answer from present = false, and the
-- FR-23 tests rely on being able to tell them apart.
INSERT INTO channel_actor_mix (org_id, channel_id, actor_type, present) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-000000000001', 'human', true),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-000000000001', 'asa',   true),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-000000000001', 'user',  true),

  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-00000000000a', 'human', true),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-00000000000a', 'asa',   true),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-00000000000a', 'user',  true),

  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-00000000000b', 'human', false),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-00000000000b', 'asa',   true),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'aaaaaaaa-2222-4000-8000-00000000000b', 'user',  true),

  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-2222-4000-8000-000000000002', 'human', true),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'bbbbbbbb-2222-4000-8000-000000000002', 'user',  true);

-- ── The roster ──────────────────────────────────────────────────────────────
-- Fixed clock: every shift runs 2026-09-03 08:00 to 18:00 UTC, and the suite
-- evaluates at 12:00. A fixture whose answer depends on when the suite runs is
-- a fixture that fails at midnight.
DO $$
DECLARE
  org        UUID := 'aaaaaaaa-0000-4000-8000-000000000001';
  ch_whats   UUID := 'aaaaaaaa-2222-4000-8000-000000000001';
  ch_voice   UUID := 'aaaaaaaa-2222-4000-8000-00000000000a';
  i          INTEGER;
  aid        UUID;
  primary_ch UUID;
  is_live    BOOLEAN;
BEGIN
  FOR i IN 0..33 LOOP
    aid := gen_random_uuid();

    -- Alternate the primary channel the way the simulator walks its list.
    primary_ch := CASE WHEN i % 2 = 0 THEN ch_whats ELSE ch_voice END;
    is_live    := (i % 7) <> 0;

    INSERT INTO actors (id, org_id, actor_type, display_id, display_name,
                        identity_rung, active, attributes)
    VALUES (aid, org, 'human', 'AG-' || (1040 + i)::TEXT,
            'Agent ' || (1040 + i)::TEXT, 'identified', true,
            jsonb_build_object('tenure_months', 1 + (i % 48)));

    INSERT INTO actor_channel_skills (org_id, actor_id, channel_id)
    VALUES (org, aid, primary_ch);

    -- One agent in three is multi-skilled. This is the whole point of the
    -- fixture: without it the sum equals the distinct count and FR-20 cannot
    -- fail even when the implementation is wrong.
    IF i % 3 = 0 THEN
      INSERT INTO actor_channel_skills (org_id, actor_id, channel_id)
      VALUES (org, aid,
              CASE WHEN primary_ch = ch_whats THEN ch_voice ELSE ch_whats END);
    END IF;

    -- Every agent has a shift row. Liveness is derived (D-26), so the five
    -- off-shift agents are excluded by their WINDOW, not by a stored flag —
    -- which is the property the suite needs to be able to check.
    INSERT INTO actor_shifts (org_id, actor_id, starts_at, ends_at, status)
    VALUES (org, aid,
            CASE WHEN is_live THEN TIMESTAMPTZ '2026-09-03 08:00:00+00'
                              ELSE TIMESTAMPTZ '2026-09-02 08:00:00+00' END,
            CASE WHEN is_live THEN TIMESTAMPTZ '2026-09-03 18:00:00+00'
                              ELSE TIMESTAMPTZ '2026-09-02 18:00:00+00' END,
            'scheduled');
  END LOOP;
END $$;

-- One agent on break inside a live window. Derived liveness must exclude them
-- even though the clock says they are within their shift.
DO $$
DECLARE
  org UUID := 'aaaaaaaa-0000-4000-8000-000000000001';
  aid UUID := gen_random_uuid();
BEGIN
  INSERT INTO actors (id, org_id, actor_type, display_id, display_name, identity_rung)
  VALUES (aid, org, 'human', 'AG-1099', 'Agent On Break', 'identified');
  INSERT INTO actor_channel_skills (org_id, actor_id, channel_id)
  VALUES (org, aid, 'aaaaaaaa-2222-4000-8000-000000000001');
  INSERT INTO actor_shifts (org_id, actor_id, starts_at, ends_at, status)
  VALUES (org, aid, TIMESTAMPTZ '2026-09-03 08:00:00+00',
          TIMESTAMPTZ '2026-09-03 18:00:00+00', 'break');
END $$;

-- ── The ASA fleet ───────────────────────────────────────────────────────────
-- Deployments, not instances. A static channel's ASA is provisioned smaller and
-- runs an older build, exactly as the simulator has it.
INSERT INTO actors (org_id, actor_type, display_id, identity_rung,
                    build_version, provider, instances_total, instances_live) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'asa', 'ASA-WHAT-01', 'inferred',
   'v4.2.1', 'customer', 4, 3),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'asa', 'ASA-WHAT-02', 'inferred',
   'v4.1.8', 'customer', 2, 1),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'asa', 'ASA-VOIC-01', 'inferred',
   'v4.2.1', 'customer', 3, 2),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'asa', 'ASA-WEB-01',  'inferred',
   'v3.9.4', 'customer', 2, 2);

INSERT INTO actor_channel_skills (org_id, actor_id, channel_id)
SELECT a.org_id, a.id,
       CASE
         WHEN a.display_id LIKE 'ASA-WHAT%' THEN 'aaaaaaaa-2222-4000-8000-000000000001'::uuid
         WHEN a.display_id LIKE 'ASA-VOIC%' THEN 'aaaaaaaa-2222-4000-8000-00000000000a'::uuid
         ELSE 'aaaaaaaa-2222-4000-8000-00000000000b'::uuid
       END
  FROM actors a
 WHERE a.org_id = 'aaaaaaaa-0000-4000-8000-000000000001'
   AND a.actor_type = 'asa';

-- ── Users, across the identity ladder ───────────────────────────────────────
-- One rung each. `identified` carries a name; the other three cannot, and the
-- schema refuses to let them.
INSERT INTO actors (org_id, actor_type, display_id, display_name, identity_rung) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'user', 'MBR-20440', 'Member Name', 'identified'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'user', 'GHO-70001', NULL,          'ghost'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'user', 'SES-90217', NULL,          'guest'),
  ('aaaaaaaa-0000-4000-8000-000000000001', 'user', 'INF-10001', NULL,          'inferred');

-- ── Tenant B ────────────────────────────────────────────────────────────────
-- Three agents, all live, one channel. Deliberately unequal to tenant A: if the
-- availability path leaks, tenant A's 29 changes, and a test that compares two
-- identical rosters would not notice.
DO $$
DECLARE
  org UUID := 'bbbbbbbb-0000-4000-8000-000000000002';
  ch  UUID := 'bbbbbbbb-2222-4000-8000-000000000002';
  i   INTEGER;
  aid UUID;
BEGIN
  FOR i IN 1..3 LOOP
    aid := gen_random_uuid();
    INSERT INTO actors (id, org_id, actor_type, display_id, display_name, identity_rung)
    VALUES (aid, org, 'human', 'BG-' || (2000 + i)::TEXT,
            'B Agent ' || i::TEXT, 'identified');
    INSERT INTO actor_channel_skills (org_id, actor_id, channel_id)
    VALUES (org, aid, ch);
    INSERT INTO actor_shifts (org_id, actor_id, starts_at, ends_at, status)
    VALUES (org, aid, TIMESTAMPTZ '2026-09-03 08:00:00+00',
            TIMESTAMPTZ '2026-09-03 18:00:00+00', 'scheduled');
  END LOOP;
END $$;
