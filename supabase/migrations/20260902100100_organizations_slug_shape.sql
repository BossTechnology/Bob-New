-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · Slice 0 · Migration 2 of 4
-- Migration Order step 2 — SR-1, the tenant slug.
--
-- CONTRACT AMENDMENT (recorded in Documentation/contract-amendments.md, A-01):
-- Handoff §4.2 writes this as `ALTER TABLE organizations ADD COLUMN slug`. The
-- column already exists — `slug TEXT NOT NULL UNIQUE` in the initial schema —
-- so the ADD would fail. What is genuinely missing is the shape constraint and
-- the immutability guarantee, and that is all this migration adds.
--
-- SR-1: org_id stays the key for RLS and every foreign key inside BOb. The slug
-- is what crosses the boundary, in both directions, and it MUST equal the
-- bzzz.tenant tag applied at ingestion.
--
-- RULING APPLIED — D-18 (Q7, option b):
-- The specification says the slug is immutable "once telemetry has been emitted
-- under it". BOb cannot evaluate that condition: the fact lives in the truth
-- store, and the one rule that generates the other five is that BOb never
-- queries the truth store. So the condition becomes a BOb-owned marker.
-- Before telemetry starts, a slug typo is a correction. After, it is a data
-- migration across the truth store, and the trigger refuses it.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ── Assert before constraining ──────────────────────────────────────────────
-- A slug that does not match the shape cannot equal a bzzz.tenant tag, so it
-- is already broken — it is simply not broken visibly yet. Fail loudly and
-- name the rows rather than coercing them.
DO $$
DECLARE bad TEXT;
BEGIN
  SELECT string_agg(format('%s (%s)', slug, id), ', ') INTO bad
    FROM organizations
   WHERE slug !~ '^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$';
  IF bad IS NOT NULL THEN
    RAISE EXCEPTION
      'organizations.slug does not satisfy the SR-1 shape for: %. '
      'Each must equal the bzzz.tenant tag applied at ingestion; correct them '
      'before this migration can proceed.', bad;
  END IF;
END $$;

ALTER TABLE organizations
  ADD CONSTRAINT organizations_slug_shape
  CHECK (slug ~ '^[a-z0-9]([a-z0-9-]{0,60}[a-z0-9])?$');

-- ── The marker that gates immutability ──────────────────────────────────────
-- NULL means no telemetry has been emitted under this slug as far as BOb has
-- been told. It is set once, by whatever provisions the tenant, and from that
-- moment the slug is frozen.
ALTER TABLE organizations
  ADD COLUMN telemetry_started_at TIMESTAMPTZ;

COMMENT ON COLUMN organizations.telemetry_started_at IS
  'D-18. Set once when the first signal is emitted under this slug. BOb cannot '
  'observe the truth store, so this marker stands in for the condition SR-1 '
  'states. Freezes the slug; cannot itself be cleared or moved backwards.';

-- ── The trigger ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.enforce_slug_immutability()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  -- The marker gates the slug, so the marker must be at least as protected as
  -- the slug is. Clearing it or moving it backwards would make the gate a
  -- formality that any UPDATE can step around.
  IF OLD.telemetry_started_at IS NOT NULL
     AND (NEW.telemetry_started_at IS NULL
          OR NEW.telemetry_started_at <> OLD.telemetry_started_at) THEN
    RAISE EXCEPTION
      'organizations.telemetry_started_at is set once and never changed '
      '(org %). It is what makes the slug immutable.', OLD.id
      USING ERRCODE = 'restrict_violation';
  END IF;

  IF OLD.telemetry_started_at IS NOT NULL AND NEW.slug IS DISTINCT FROM OLD.slug THEN
    RAISE EXCEPTION
      'organizations.slug is immutable once telemetry exists under it '
      '(org %, slug %). Renaming a tenant is a migration across the truth '
      'store, not an UPDATE. SR-1.', OLD.id, OLD.slug
      USING ERRCODE = 'restrict_violation';
  END IF;

  RETURN NEW;
END $$;

ALTER FUNCTION public.enforce_slug_immutability() SET search_path = public;

DROP TRIGGER IF EXISTS trg_organizations_slug_immutable ON organizations;
CREATE TRIGGER trg_organizations_slug_immutable
  BEFORE UPDATE ON organizations
  FOR EACH ROW EXECUTE FUNCTION public.enforce_slug_immutability();

COMMENT ON COLUMN organizations.slug IS
  'SR-1. Equals the bzzz.tenant tag applied at ingestion. Used in exactly two '
  'places: by the feeder querying the truth store, and by BOb emitting '
  'telemetry. Immutable once telemetry_started_at is set.';

COMMIT;
