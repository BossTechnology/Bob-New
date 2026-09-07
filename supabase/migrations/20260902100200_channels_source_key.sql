-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · Slice 0 · Migration 3 of 4
-- Migration Order step 3 — SR-2, PR-9, D-16.
--
-- The second load-bearing string, one level below the tenant slug and with less
-- attention paid to it. A BOb channel and a bzzz.source must be the same thing
-- or the feeder produces rows that map to nothing and the channel silently
-- reports zero.
--
-- RULINGS APPLIED:
--   D-19 (Q8, option b) — existing rows are backfilled with a deliberately
--        invalid sentinel rather than a derived value. A key derived from
--        channel_type and display_name would look configured while resolving
--        to nothing, which is exactly the SR-2 failure the Handoff calls the
--        single most likely source of a confused first deployment. The
--        sentinel is unmistakable, unique per row, and machine-detectable.
--   D-16 — adapter_kind takes four values. `synthetic` is capture by synthetic
--        probe and is a different thing from autobotz.type = 'synthetics',
--        which is an action. They stay separate on purpose.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── The unset sentinel, defined once ────────────────────────────────────────
-- Same discipline as RS-31's derived freshness: one definition governs the
-- interface, the feeder and the tests, so the three cannot drift on what
-- "not yet configured" means.
CREATE OR REPLACE FUNCTION public.bob_source_key_unset(key TEXT)
RETURNS BOOLEAN LANGUAGE sql IMMUTABLE AS $$
  SELECT key IS NULL OR key LIKE '\_\_unset\_\_:%';
$$;

ALTER FUNCTION public.bob_source_key_unset(TEXT) SET search_path = public;

COMMENT ON FUNCTION public.bob_source_key_unset(TEXT) IS
  'SR-2 / PR-10. True when a channel is configured but not yet emitting. The '
  'interface must render this state distinctly from a channel that is emitting '
  'zero. One definition so the interface, the feeder and the suite agree.';

-- ── SR-2 · source_key ───────────────────────────────────────────────────────
ALTER TABLE channels ADD COLUMN source_key TEXT;

UPDATE channels
   SET source_key = '__unset__:' || id::text
 WHERE source_key IS NULL;

ALTER TABLE channels ALTER COLUMN source_key SET NOT NULL;

ALTER TABLE channels
  ADD CONSTRAINT channels_source_key_unique UNIQUE (org_id, source_key);

COMMENT ON COLUMN channels.source_key IS
  'SR-2. MUST equal the bzzz.source tag applied at ingestion for every signal '
  'originating from this channel. A value matching bob_source_key_unset() '
  'means configured but not yet emitting — not emitting zero.';

-- ── PR-9 · declared lag ─────────────────────────────────────────────────────
-- RULING APPLIED — D-25, amending Handoff §4.2.
--
-- The Handoff specifies `NOT NULL DEFAULT 0`. That is wrong in a way that only
-- shows up later: zero is not the absence of a declaration, it is a
-- declaration that the channel is LIVE. A voice channel is not live — a
-- twelve-minute call produces its facts after it ends — so a zero default
-- asserts something about every channel that nobody has checked.
--
-- This is the PR-10 absent-versus-zero trap one level down, sitting in the
-- column that decides whether a threshold may evaluate against an open bucket
-- (PR-7). Being wrong here fires alerts on incomplete data.
--
-- So: nullable, no default. NULL means not declared, and the evaluator must
-- refuse to evaluate an open bucket for a channel that has not declared.
ALTER TABLE channels ADD COLUMN lag_seconds INTEGER;

COMMENT ON COLUMN channels.lag_seconds IS
  'PR-9 / D-25. Declared lag between an interaction and its facts arriving. '
  'NULL means NOT DECLARED — not zero, and not live. Slice 5''s evaluator must '
  'refuse to evaluate an open bucket for a channel whose lag is undeclared '
  '(PR-7), rather than assuming it is current.';

-- ── D-16 · adapter_kind ─────────────────────────────────────────────────────
-- Nullable per the Handoff's shape. NULL is honestly "not declared", which is
-- the right reading for channels that predate this migration.
ALTER TABLE channels
  ADD COLUMN adapter_kind TEXT
  CHECK (adapter_kind IN ('native_otel','signal_maker','external','synthetic'));

COMMENT ON COLUMN channels.adapter_kind IS
  'D-16. How signal reaches the platform from this channel. `synthetic` is '
  'capture by synthetic probe and is unrelated to autobotz.type = ''synthetics'', '
  'which is an action. NULL means not yet declared.';

COMMIT;
