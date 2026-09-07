-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · Slice 0 · Migration 1 of 4
-- Migration Order step 1 — autobotz: rename, align to Data Model §3.4,
-- and correct the load-bearing string.
--
-- Closes repository findings R-01, R-02 and R-03.
--
-- RULINGS APPLIED (Phase 1 Decision Sheet):
--   D-20  provider carries NO CHECK constraint. §3.4 defines the column as
--         open — `bzzzbx | customer | named integration`. A customer's own RPA
--         vendor is a provider and would fail a two-value enumeration. The
--         DEFAULT is corrected to 'bzzzbx'; the spelling defect is caught
--         permanently by the repository-wide naming assertion in the suite,
--         not by a CHECK that also excludes legitimate values.
--   D-21  client_id is DROPPED. It existed only to round-trip the simulator's
--         in-memory local ids, and C-10 rules the simulator a behavioural
--         specification rather than an implementation to port.
--         `scope` becomes `scope_kind`; `scope_ref` arrives beside it.
--   R-03  verify_state DROPS 'pending'. RS-30 requires four distinguishable
--         states and RS-31 derives stale rather than storing it, so the stored
--         set is three. A verification in flight is `unverified` carrying its
--         reason in verify_msg — never a fabricated `ok`.
--   D-10  BR-3 mutative flag ships with NO DEFAULT. See the note below; this
--         is the only part of this migration that leaves something unresolved,
--         and it does so visibly.
--
-- NOTHING HERE IS DESTRUCTIVE OF OBSERVATION. The two migrations that can lose
-- data are Migration Order steps 9 and 18, both far downstream.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── R-02 · the table name ───────────────────────────────────────────────────
ALTER TABLE autobotz_bindings RENAME TO autobotz;

-- ── R-02 · the column names, per Data Model §3.4 ────────────────────────────
ALTER TABLE autobotz RENAME COLUMN ref       TO reference;
ALTER TABLE autobotz RENAME COLUMN config    TO binding;
ALTER TABLE autobotz RENAME COLUMN verify_ts TO verified_at;
ALTER TABLE autobotz RENAME COLUMN scope     TO scope_kind;

-- ── D-21 · client_id leaves ─────────────────────────────────────────────────
DROP INDEX IF EXISTS idx_ab_org_client;
ALTER TABLE autobotz DROP COLUMN IF EXISTS client_id;

-- ── R-01 · the load-bearing string ──────────────────────────────────────────
-- Correct the data first, then the DEFAULT, then remove the CHECK that
-- enshrined the misspelling. Order matters: the UPDATE must run while the old
-- CHECK still permits 'bzzzbox', and the new DEFAULT must not be applied by a
-- constraint that forbids it.
UPDATE autobotz SET provider = 'bzzzbx' WHERE provider = 'bzzzbox';

ALTER TABLE autobotz DROP CONSTRAINT IF EXISTS autobotz_bindings_provider_check;
ALTER TABLE autobotz ALTER COLUMN provider SET DEFAULT 'bzzzbx';

-- ── R-03 · verify_state loses 'pending' ─────────────────────────────────────
-- 'pending' is transient by definition, so this is a state correction rather
-- than a loss. The reason is recorded so no row silently changes meaning.
UPDATE autobotz
   SET verify_state = 'unverified',
       verified_at  = NULL,
       verify_msg   = 'Reconciled from pending at R-03: a check in flight is '
                      || 'unverified until it completes'
 WHERE verify_state = 'pending';

ALTER TABLE autobotz DROP CONSTRAINT IF EXISTS autobotz_bindings_verify_state_check;
ALTER TABLE autobotz
  ADD CONSTRAINT autobotz_verify_state_check
  CHECK (verify_state IN ('unverified','ok','failed'));

-- ── §3.4 · scope, guardrails and the enabled flag ───────────────────────────
-- scope_kind arrives from `scope`, which carried no CHECK. Assert the existing
-- values before constraining the column: a silent coercion here would change
-- what a binding applies to without anybody seeing it.
DO $$
DECLARE bad TEXT;
BEGIN
  SELECT string_agg(DISTINCT scope_kind, ', ') INTO bad
    FROM autobotz
   WHERE scope_kind NOT IN ('company','metric','entity','actor');
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'autobotz.scope_kind holds values outside the §3.4 set: %. '
      'Rule on each before this migration can proceed.', bad;
  END IF;
END $$;

ALTER TABLE autobotz
  ADD CONSTRAINT autobotz_scope_kind_check
  CHECK (scope_kind IN ('company','metric','entity','actor'));

ALTER TABLE autobotz
  ADD COLUMN scope_ref            TEXT,
  ADD COLUMN enabled              BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN rate_limit_per_hour  INTEGER,
  ADD COLUMN concurrency_limit    INTEGER,
  ADD COLUMN invocation_cap_daily INTEGER,
  ADD COLUMN requires_approval    BOOLEAN NOT NULL DEFAULT false;

-- ── BR-3 / D-10 · the mutative flag, with no default ────────────────────────
-- A journey that checks whether a field accepts input is inert. A journey that
-- completes a checkout creates a real order. Same binding type, opposite risk,
-- so BOb refuses to register a binding without an explicit ruling.
--
-- The constraint is NOT VALID deliberately. It is enforced on every INSERT and
-- every UPDATE, so no new binding can avoid the ruling — while rows that
-- existed before this migration are exempt and remain visibly unruled rather
-- than being silently defaulted to `false`, which would assert something about
-- them that nobody has checked.
--
--   Rows still awaiting a ruling:
--     SELECT id, label, type FROM autobotz WHERE mutative IS NULL;
--
--   Once every row is ruled, this closes the exemption:
--     ALTER TABLE autobotz VALIDATE CONSTRAINT autobotz_mutative_declared;
ALTER TABLE autobotz ADD COLUMN mutative BOOLEAN;

ALTER TABLE autobotz
  ADD CONSTRAINT autobotz_mutative_declared
  CHECK (mutative IS NOT NULL) NOT VALID;

-- ── Artefacts must not keep the old name ────────────────────────────────────
-- An index or policy still called *_bindings is how a rename half-happens.
ALTER INDEX IF EXISTS idx_ab_org RENAME TO idx_autobotz_org;
ALTER INDEX IF EXISTS idx_ab_due RENAME TO idx_autobotz_due;

ALTER TABLE autobotz RENAME CONSTRAINT autobotz_bindings_pkey
  TO autobotz_pkey;
ALTER TABLE autobotz RENAME CONSTRAINT autobotz_bindings_type_check
  TO autobotz_type_check;
ALTER TABLE autobotz RENAME CONSTRAINT autobotz_bindings_org_id_fkey
  TO autobotz_org_id_fkey;

DROP POLICY IF EXISTS "org_autobotz_bindings" ON autobotz;
CREATE POLICY "org_autobotz" ON autobotz FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);

DROP TRIGGER IF EXISTS trg_ab_updated_at ON autobotz;
CREATE TRIGGER trg_autobotz_updated_at
  BEFORE UPDATE ON autobotz
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

COMMENT ON TABLE autobotz IS
  'AutoBotz registry. A binding names an automation that exists elsewhere; BOb '
  'never stores the automation and never stores a credential. Data Model §3.4.';
COMMENT ON COLUMN autobotz.provider IS
  'Where the automation runs. Open by §3.4 — bzzzbx, customer, or a named '
  'integration. Names a location; does not authenticate to it.';
COMMENT ON COLUMN autobotz.mutative IS
  'BR-3. True if invoking this binding changes state in the world. No default: '
  'a binding without an explicit ruling cannot be registered.';

COMMIT;
