-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · Slice 0 · Migration 4 of 4
-- Handoff §4.3 — the three-role split. PR-4 is enforced here, not in code.
--
-- "The shortcut that breaks that boundary is always well-intentioned and takes
-- four minutes. A grant makes it impossible rather than discouraged."
--
-- RULINGS APPLIED — D-22, and N-04 (CLOSED: full stack on the VPS, direct
-- Postgres connection).
--
-- Three roles are created with correct grants. The projection write revoke is
-- ALSO applied to `authenticated`, the role PostgREST switches to, because
-- Supabase's own default privileges grant it everything on new tables in
-- public — without that revoke the grant on bob_app would be decorative.
--
-- WHAT IS STILL NOT COVERED, AND IT IS NOT CLOSED BY THIS MIGRATION.
-- The service role bypasses RLS and is used across 25 route files. N-04 closing
-- makes A-05 FIXABLE, not fixed. Two things must happen in application code and
-- deployment, neither of which belongs in a migration:
--
--   1. bob_app becomes a LOGIN role with a credential, and BOb's connection
--      string uses it. A password cannot be invented here.
--   2. The service-role read paths move to the user-scoped client, so
--      `authenticated` is the effective role on every read.
--
-- Until both are done, PR-4 is enforced on the PostgREST path and unenforced on
-- the service-role path. Tracked as A-05 in Documentation/contract-amendments.md
-- and scheduled for Slice 2. Anyone reading this file should not conclude that
-- PR-4 is fully enforced today, because it is not.
--
-- WHY THERE IS NO BLANKET DEFAULT PRIVILEGE HERE. It is tempting to write
-- ALTER DEFAULT PRIVILEGES ... REVOKE INSERT, UPDATE, DELETE FROM authenticated
-- so every future table is read-only. That would also strip write access from
-- every future CONFIGURATION table, which authenticated legitimately writes —
-- breaking Slice 5 quietly and in a way that looks like an RLS bug. The grant
-- pattern is a function instead, applied per projection table, and the suite
-- asserts every proj_* table has had it applied. The test is the enforcement.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── The three roles ─────────────────────────────────────────────────────────
-- NOLOGIN for now: these are grantable groups. N-04 settled that BOb connects
-- directly to Postgres on the VPS, so bob_app becomes a LOGIN role when its
-- credential is provisioned — a deployment step, not a migration step. Creating
-- the roles and their grants now means the permission structure exists before
-- anything needs it, which is the whole point of doing this in Slice 0.
DO $$ BEGIN
  CREATE ROLE bob_app NOLOGIN;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'role bob_app already exists';
END $$;

DO $$ BEGIN
  CREATE ROLE bob_feeder NOLOGIN;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'role bob_feeder already exists';
END $$;

DO $$ BEGIN
  CREATE ROLE bob_ai_ro NOLOGIN;
EXCEPTION WHEN duplicate_object THEN
  RAISE NOTICE 'role bob_ai_ro already exists';
END $$;

COMMENT ON ROLE bob_app    IS 'The application. RW on configuration and live state, read-only on projections. PR-4.';
COMMENT ON ROLE bob_feeder IS 'The feeder. Writes projections. No read on configuration — if the reference feeder needs something BOb owns, that is a finding about the contract.';
COMMENT ON ROLE bob_ai_ro  IS 'The reasoning tier. Read-only on named v_ai_* views and nothing else. IR-1.';

GRANT USAGE ON SCHEMA public TO bob_app, bob_feeder, bob_ai_ro;

-- ── bob_app · configuration and live state ──────────────────────────────────
-- Granted over what exists today. Projection tables do not exist until Slice 2
-- and are granted through bob_grant_projection() below, never ad hoc.
GRANT SELECT, INSERT, UPDATE, DELETE ON
  organizations, users, channels, notification_channels, threshold_configs,
  response_rules, anomaly_rules, text_rules, autobotz,
  alerts, alert_log, notification_log, anomalies, audit_log,
  bobee_conversations, configurations, notification_rules
TO bob_app;

-- ── bob_feeder · the mapping it needs, and nothing else ─────────────────────
-- Handoff §4.3: "The feeder needs nothing from BOb except the channel and
-- source key mapping, which it gets from a named view." The view is defined
-- here so the feeder never holds a grant on the channels table itself.
CREATE OR REPLACE VIEW public.v_feeder_channel_map
WITH (security_invoker = true) AS
  SELECT c.id AS channel_id,
         c.org_id,
         o.slug AS tenant_slug,
         c.source_key,
         c.lag_seconds,
         c.adapter_kind
    FROM channels c
    JOIN organizations o ON o.id = c.org_id;

COMMENT ON VIEW public.v_feeder_channel_map IS
  'The only thing the feeder reads from BOb: source_key to channel_id, and the '
  'tenant slug that joins to bzzz.tenant. Carries no configuration and no '
  'display_name.';

GRANT SELECT ON public.v_feeder_channel_map TO bob_feeder;

-- ── The projection grant pattern, defined once ──────────────────────────────
-- Slice 2 calls this for each of the eight tables. Writing the grants by hand
-- eight times is how one of them ends up writable by the application, and that
-- is the failure PR-4 exists to make impossible rather than discouraged.
CREATE OR REPLACE FUNCTION public.bob_grant_projection(tbl regclass)
RETURNS VOID LANGUAGE plpgsql AS $$
BEGIN
  -- The feeder writes.
  EXECUTE format('GRANT SELECT, INSERT, UPDATE, DELETE ON %s TO bob_feeder', tbl);

  -- The application reads and cannot write. PR-4.
  EXECUTE format('GRANT SELECT ON %s TO bob_app', tbl);
  EXECUTE format('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %s FROM bob_app', tbl);

  -- PostgREST switches to `authenticated`, and Supabase's own default
  -- privileges grant it everything on new tables in public. Without this
  -- revoke the application can write projections through the API regardless of
  -- what bob_app is allowed, and PR-4 would be decorative. D-22.
  EXECUTE format(
    'REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON %s FROM anon, authenticated', tbl);
  EXECUTE format('GRANT SELECT ON %s TO authenticated', tbl);
END $$;

ALTER FUNCTION public.bob_grant_projection(regclass) SET search_path = public;

COMMENT ON FUNCTION public.bob_grant_projection(regclass) IS
  'PR-4, applied. Every projection table created in Slice 2 must be passed '
  'through this. The suite asserts that every proj_* table has been.';

REVOKE EXECUTE ON FUNCTION public.bob_grant_projection(regclass)
  FROM public, anon, authenticated;

COMMIT;
