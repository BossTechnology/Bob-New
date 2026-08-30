-- ════════════════════════════════════════════════════════════════════════════
-- BOb — AutoBotz bindings + scheduled re-verification
--
-- The v5.3 specification lists re-verification as not started:
--   "Verification is manual. Freshness is tracked and stale states render, but
--    nothing re-checks. Belongs in a Vercel cron alongside the existing nine."
--
-- A cron runs server-side, so it needs the bindings in the database. Today they
-- live only in `window._autoBotz`, seeded in memory by the simulator and never
-- persisted. This table closes that gap; /api/cron/autobotz-reverify walks it.
--
-- BOb stores a binding, never an automation: a provider, a reference to
-- something that already exists in BzzzBX or the customer's systems, and the
-- inputs needed to invoke it. Per-type inputs go in `config` rather than a
-- column each, because the four types share almost no fields.
--
-- verify_state keeps the four values the simulator's abState() understands
-- (ok / failed / pending / unverified). "Stale" is not stored: it is derived
-- from ok + age > 30d, and stays derived so one definition governs both sides.
-- A check the cron cannot honestly perform stays `unverified` with the reason
-- in verify_msg — never a fabricated `ok`.
-- ════════════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS autobotz_bindings (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  client_id     TEXT,
  type          TEXT NOT NULL CHECK (type IN ('webhook','rpa','synthetics','agent')),
  label         TEXT NOT NULL,
  provider      TEXT NOT NULL DEFAULT 'bzzzbox' CHECK (provider IN ('bzzzbox','customer')),
  scope         TEXT NOT NULL DEFAULT 'company',
  ref           TEXT NOT NULL,
  config        JSONB NOT NULL DEFAULT '{}'::jsonb,
  verify_state  TEXT NOT NULL DEFAULT 'unverified'
                CHECK (verify_state IN ('ok','failed','pending','unverified')),
  verify_ts     TIMESTAMPTZ,
  verify_msg    TEXT NOT NULL DEFAULT '',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_ab_org ON autobotz_bindings(org_id);

-- The cron's working set: bindings whose verification is oldest (NULLs first,
-- i.e. never verified) are the ones due for a re-check.
CREATE INDEX IF NOT EXISTS idx_ab_due ON autobotz_bindings(org_id, verify_ts NULLS FIRST);

-- A binding belongs to one org and carries the dashboard's local id so the
-- bridge can round-trip without renumbering client state.
CREATE UNIQUE INDEX IF NOT EXISTS idx_ab_org_client
  ON autobotz_bindings(org_id, client_id) WHERE client_id IS NOT NULL;

ALTER TABLE autobotz_bindings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_autobotz_bindings" ON autobotz_bindings;
CREATE POLICY "org_autobotz_bindings" ON autobotz_bindings FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);

DROP TRIGGER IF EXISTS trg_ab_updated_at ON autobotz_bindings;
CREATE TRIGGER trg_ab_updated_at
  BEFORE UPDATE ON autobotz_bindings
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
