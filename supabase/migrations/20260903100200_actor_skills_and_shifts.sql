-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · Slice 1 · Migration 3 of 4
-- Migration Order step 4 (part) — skills and shifts. Data Model §5.2.
--
-- Human availability is a set intersection between on-shift agents and
-- channels. That needs two supporting tables and no third.
--
-- RULING APPLIED — D-26 / Q11 (option b). §5.2 stores `status = 'live'` and the
-- availability query reads it. A stored `live` on a shift that carries
-- starts_at and ends_at is a SECOND ANSWER to a question the timestamps already
-- answer, and the two disagree the moment a shift ends with nothing to update
-- the row. Availability would then report agents who went home — plausibly,
-- and with nothing looking broken, which is the FR-20 failure mode exactly.
--
-- So `status` holds AUTHORED INTENT and liveness is DERIVED. Same discipline as
-- RS-31, where stale is computed and never stored.
--
-- 'live' is REMOVED from the stored set, confirmed, for the same reason R-03
-- removed 'pending': a stored value that duplicates a derived one is a value
-- that will eventually contradict it.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE actor_channel_skills (
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id   UUID NOT NULL REFERENCES actors(id)        ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id)      ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (org_id, actor_id, channel_id)
);

-- The index that carries FR-20. The availability query intersects skills with
-- a channel array, so channel_id leads.
CREATE INDEX idx_acs_channel ON actor_channel_skills (org_id, channel_id, actor_id);

ALTER TABLE actor_channel_skills ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_actor_channel_skills" ON actor_channel_skills FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);

GRANT SELECT, INSERT, UPDATE, DELETE ON actor_channel_skills TO bob_app;

COMMENT ON TABLE actor_channel_skills IS
  'Data Model §5.2. Authored in BOb, which is why availability does not wait on '
  'D-02: skills are declared here and presence comes from shifts.';

-- ── Shifts ──────────────────────────────────────────────────────────────────

CREATE TABLE actor_shifts (
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_id   UUID NOT NULL REFERENCES actors(id)        ON DELETE CASCADE,
  starts_at  TIMESTAMPTZ NOT NULL,
  ends_at    TIMESTAMPTZ NOT NULL,

  -- Authored intent only. NOT liveness — see bob_shift_is_live() below.
  --   scheduled  the shift stands as planned
  --   break      the agent is away within the window
  --   ended      closed early, before ends_at
  status     TEXT NOT NULL DEFAULT 'scheduled'
             CHECK (status IN ('scheduled','break','ended')),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (org_id, actor_id, starts_at),

  CONSTRAINT actor_shifts_window CHECK (ends_at > starts_at)
);

CREATE INDEX idx_shifts_window ON actor_shifts (org_id, actor_id, starts_at, ends_at);

ALTER TABLE actor_shifts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_actor_shifts" ON actor_shifts FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE TRIGGER trg_actor_shifts_updated_at
  BEFORE UPDATE ON actor_shifts
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON actor_shifts TO bob_app;

-- ── Liveness, derived in exactly one place ──────────────────────────────────
-- One definition so the availability function, the roster view and the suite
-- cannot drift on what "on shift" means. `at_time` is a parameter rather than
-- now() so the property is testable without waiting for a clock.
CREATE OR REPLACE FUNCTION public.bob_shift_is_live(
  starts_at TIMESTAMPTZ,
  ends_at   TIMESTAMPTZ,
  status    TEXT,
  at_time   TIMESTAMPTZ DEFAULT now()
) RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT at_time >= starts_at
     AND at_time <  ends_at
     AND status NOT IN ('break','ended');
$$;

ALTER FUNCTION public.bob_shift_is_live(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ)
  SET search_path = public;

COMMENT ON FUNCTION public.bob_shift_is_live(TIMESTAMPTZ, TIMESTAMPTZ, TEXT, TIMESTAMPTZ) IS
  'D-26. Liveness is derived, never stored. A shift that has ended is not live '
  'whether or not anything got round to updating its row.';

COMMENT ON COLUMN actor_shifts.status IS
  'D-26. Authored intent, not liveness. `live` is deliberately absent from this '
  'set: it would duplicate what the timestamps already say and would '
  'eventually contradict them.';

COMMIT;
