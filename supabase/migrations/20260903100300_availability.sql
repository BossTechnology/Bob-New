-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · Slice 1 · Migration 4 of 4
-- Availability — PR-8, FR-20, FR-21, FR-22, FR-23. And v_roster.
--
-- "There is no table for availability because it is a query." Data Model §7.3,
-- restated as a rule by PR-8. It is not projected, not cached, not summed, and
-- it is the one figure on the matrix that stays correct when the feeder is down.
--
-- WHY THIS LIVES IN THE DATABASE RATHER THAN IN A ROUTE. FR-20 is the single
-- most important rule in the acceptance suite and its failure mode is a second
-- caller reimplementing it as a sum. One function means there is one
-- implementation to get right, and the suite tests the thing the application
-- actually calls.
--
-- THREE ROWS, THREE DIFFERENT COMPUTATIONS. Only the Human row de-duplicates.
--   Human  distinct on-shift agents whose skills intersect the selection
--   ASA    SUM of live instances — capacity, not entities (FR-21)
--   User   concurrency by Little's Law (FR-22)
-- Forcing all three through one distinct count would be wrong in a new
-- direction. The word is shared; the arithmetic is not.
--
-- All functions are SECURITY INVOKER. A SECURITY DEFINER function here would
-- bypass RLS and hand one tenant another tenant's roster.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── FR-20 · Human ───────────────────────────────────────────────────────────
-- A DISTINCT count. Never a sum over channels. On the simulator's own roster a
-- sum reports 48 against a correct 29 — a 65% overstatement that nothing looks
-- broken about, and that response time targets, escalation policy and staffing
-- decisions all inherit silently.
CREATE OR REPLACE FUNCTION public.bob_availability_human(
  p_org_id   UUID,
  p_channels UUID[],
  p_at       TIMESTAMPTZ DEFAULT now()
) RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT count(DISTINCT s.actor_id)::INTEGER
    FROM actor_channel_skills s
    JOIN actors  a ON a.id = s.actor_id AND a.actor_type = 'human' AND a.active
    JOIN channel_actor_mix m
      ON m.org_id = s.org_id AND m.channel_id = s.channel_id
     AND m.actor_type = 'human' AND m.present
    JOIN actor_shifts sh
      ON sh.org_id = s.org_id AND sh.actor_id = s.actor_id
     AND public.bob_shift_is_live(sh.starts_at, sh.ends_at, sh.status, p_at)
   WHERE s.org_id = p_org_id
     AND s.channel_id = ANY(p_channels);
$$;

-- The wrong answer, written down on purpose. Not called by the application;
-- called by the suite, which asserts the correct figure is strictly smaller.
-- A test that only checks "29" passes just as well against a roster with no
-- multi-skilled agents, where the bug cannot appear.
CREATE OR REPLACE FUNCTION public.bob_availability_human_summed(
  p_org_id   UUID,
  p_channels UUID[],
  p_at       TIMESTAMPTZ DEFAULT now()
) RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT count(*)::INTEGER
    FROM actor_channel_skills s
    JOIN actors  a ON a.id = s.actor_id AND a.actor_type = 'human' AND a.active
    JOIN channel_actor_mix m
      ON m.org_id = s.org_id AND m.channel_id = s.channel_id
     AND m.actor_type = 'human' AND m.present
    JOIN actor_shifts sh
      ON sh.org_id = s.org_id AND sh.actor_id = s.actor_id
     AND public.bob_shift_is_live(sh.starts_at, sh.ends_at, sh.status, p_at)
   WHERE s.org_id = p_org_id
     AND s.channel_id = ANY(p_channels);
$$;

COMMENT ON FUNCTION public.bob_availability_human_summed(UUID, UUID[], TIMESTAMPTZ) IS
  'FR-20, the defect, preserved deliberately. The suite asserts the correct '
  'figure is strictly less than this one, so a fixture that cannot expose the '
  'bug fails the test rather than passing it.';

-- ── FR-21 · ASA ─────────────────────────────────────────────────────────────
-- Provisioned live instances, summed. This is capacity, not entities, so a
-- distinct count would be the wrong correction. It takes NO timeframe
-- parameter: FR-21 holds structurally rather than by assertion, because there
-- is nothing to pass that could change the answer.
CREATE OR REPLACE FUNCTION public.bob_availability_asa(
  p_org_id   UUID,
  p_channels UUID[]
) RETURNS INTEGER LANGUAGE sql STABLE AS $$
  SELECT COALESCE(sum(x.instances_live), 0)::INTEGER
    FROM (
      SELECT DISTINCT a.id, a.instances_live
        FROM actors a
        JOIN actor_channel_skills s ON s.actor_id = a.id AND s.org_id = a.org_id
        JOIN channel_actor_mix m
          ON m.org_id = s.org_id AND m.channel_id = s.channel_id
         AND m.actor_type = 'asa' AND m.present
       WHERE a.org_id = p_org_id
         AND a.actor_type = 'asa'
         AND s.channel_id = ANY(p_channels)
    ) x;
$$;

-- ── FR-22 · Users ───────────────────────────────────────────────────────────
-- Concurrency. Little's Law: L = λW. Volume ÷ window × average duration.
--
-- STATED GAP (Q16). Both inputs come from the projection layer, which does not
-- exist until Slice 2. This ships as a pure function with no data source, fully
-- tested against known values. FR-22 is therefore VERIFIED IN FORMULA AND
-- UNVERIFIED END TO END until Slice 2 wires it to proj_metric_counts.
--
-- No default duration. The simulator assumes thirteen minutes; assuming it here
-- would bury a constant inside a figure people make staffing decisions on.
CREATE OR REPLACE FUNCTION public.bob_availability_user(
  p_volume               BIGINT,
  p_window_minutes       NUMERIC,
  p_avg_duration_minutes NUMERIC
) RETURNS INTEGER LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE
    -- PR-10. Absent inputs give an absent answer. A zero here would say
    -- "nobody is on the site", which is a different and false claim.
    WHEN p_volume IS NULL
      OR p_window_minutes IS NULL
      OR p_avg_duration_minutes IS NULL
      OR p_window_minutes <= 0 THEN NULL
    ELSE round(p_volume::NUMERIC / p_window_minutes * p_avg_duration_minutes)::INTEGER
  END;
$$;

-- ── FR-23 · why a figure is zero ────────────────────────────────────────────
-- A zero with no explanation is indistinguishable from a broken deployment, and
-- the reasons below are genuinely different advice. Two of them exist only
-- because PR-10 distinguishes a missing row from a declared false.
CREATE OR REPLACE FUNCTION public.bob_availability_reason(
  p_org_id     UUID,
  p_channels   UUID[],
  p_actor_type TEXT,
  p_at         TIMESTAMPTZ DEFAULT now()
) RETURNS TEXT LANGUAGE plpgsql STABLE AS $$
DECLARE
  declared_any  BOOLEAN;
  declared_true BOOLEAN;
  has_skills    BOOLEAN;
BEGIN
  IF p_channels IS NULL OR cardinality(p_channels) = 0 THEN
    RETURN 'no_channels_selected';
  END IF;

  SELECT count(*) > 0, count(*) FILTER (WHERE present) > 0
    INTO declared_any, declared_true
    FROM channel_actor_mix
   WHERE org_id = p_org_id
     AND actor_type = p_actor_type
     AND channel_id = ANY(p_channels);

  -- Not observed. Nobody has said whether these channels carry this actor type.
  IF NOT declared_any THEN RETURN 'mix_not_declared'; END IF;

  -- Observed and none. This is the FR-23 case: static channels carry no humans.
  IF NOT declared_true THEN RETURN 'no_channels_carry_actor_type'; END IF;

  IF p_actor_type = 'asa' THEN RETURN 'no_live_instances'; END IF;
  IF p_actor_type <> 'human' THEN RETURN 'no_actors_available'; END IF;

  SELECT count(*) > 0 INTO has_skills
    FROM actor_channel_skills s
    JOIN actors a ON a.id = s.actor_id AND a.actor_type = 'human' AND a.active
   WHERE s.org_id = p_org_id AND s.channel_id = ANY(p_channels);

  -- Nobody is skilled here at all, versus everybody skilled here is off shift.
  -- One is a staffing plan problem; the other is a rota problem.
  IF NOT has_skills THEN RETURN 'no_skilled_actors'; END IF;
  RETURN 'none_on_shift';
END $$;

-- ── The one entry point the application calls ───────────────────────────────
CREATE OR REPLACE FUNCTION public.bob_availability(
  p_org_id               UUID,
  p_channels             UUID[],
  p_user_volume          BIGINT      DEFAULT NULL,
  p_window_minutes       NUMERIC     DEFAULT NULL,
  p_avg_duration_minutes NUMERIC     DEFAULT NULL,
  p_at                   TIMESTAMPTZ DEFAULT now()
) RETURNS TABLE (actor_type TEXT, available INTEGER, reason TEXT)
LANGUAGE plpgsql STABLE AS $$
DECLARE
  v_user  INTEGER;
  v_asa   INTEGER;
  v_human INTEGER;
BEGIN
  v_user  := public.bob_availability_user(
               p_user_volume, p_window_minutes, p_avg_duration_minutes);
  v_asa   := public.bob_availability_asa(p_org_id, p_channels);
  v_human := public.bob_availability_human(p_org_id, p_channels, p_at);

  RETURN QUERY
  SELECT t.actor_type, t.available,
         CASE WHEN COALESCE(t.available, 0) = 0
              THEN public.bob_availability_reason(
                     p_org_id, p_channels, t.actor_type, p_at)
         END
    FROM (VALUES ('user', v_user), ('asa', v_asa), ('human', v_human))
      AS t(actor_type, available);
END $$;

COMMENT ON FUNCTION public.bob_availability(UUID, UUID[], BIGINT, NUMERIC, NUMERIC, TIMESTAMPTZ) IS
  'PR-8. Availability evaluated at read time against live state. The only '
  'figure on the Performance matrix that does not read a projection, and '
  'therefore the only one that stays correct when the feeder is down. That '
  'asymmetry should be visible in the interface rather than hidden.';

-- ── v_roster · pseudonymity enforced by construction ────────────────────────
-- Data Model §5.1 says display_id is always present and revealing a name is a
-- distinct, auditable read. ID-04 has no audit path, so the Cut List ships the
-- reveal control ABSENT rather than disabled — there is nothing to misuse.
--
-- This view makes that a property of the schema rather than a decision the
-- interface has to keep making correctly. Humans and ASA deployments act on the
-- business's behalf and are legitimately observable; members are not.
CREATE OR REPLACE VIEW public.v_roster
WITH (security_invoker = true) AS
  SELECT a.id,
         a.org_id,
         a.actor_type,
         a.display_id,
         CASE WHEN a.actor_type IN ('human','asa') THEN a.display_name END
           AS display_name,
         a.identity_rung,
         a.active,
         a.build_version,
         a.instances_total,
         a.instances_live,
         a.attributes
    FROM actors a;

COMMENT ON VIEW public.v_roster IS
  'IR-1 / ID-04. Exposes display_name for human and asa actors only. A member '
  'name is not withheld by the interface; it is not in the view. When ID-04''s '
  'audit path exists the reveal becomes a separate, logged read.';

GRANT SELECT ON public.v_roster TO bob_app;

COMMIT;
