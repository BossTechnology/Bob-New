-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · Slice 1 · Migration 1 of 4
-- Migration Order step 4 (part) — `actors`.
--
-- Data Model §5.1. The simulator holds three separate structures — a human
-- roster, an ASA fleet, a user population. They look unrelated and behave
-- identically: each is a set of entities that can be counted as available,
-- attributed a share of a metric, drilled into, and pinned to a threshold
-- override. One table with a type discriminator makes the composite key work.
--
-- RULINGS APPLIED:
--   D-11 / Q15 — `identified BOOLEAN` is replaced by a four-rung ladder. The
--         schema carries it from the start because widening it later means
--         rewriting history. Terminology confirmed; a value rename is one line,
--         a new rung is not.
--   D-27 / Q12 — ASA rows carry instance counts. An ASA actor is a DEPLOYMENT,
--         not an instance: display_id is ASA-BOT-02, deployment-grained, and
--         FR-21 counts provisioned instances. Without these columns FR-21
--         cannot be built as specified.
--   D-02 — external_ref stays nullable. Authority is unsettled, and a NOT NULL
--         here would force a fabricated identifier, which fails the same silent
--         way source_key does.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE actors (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id        UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  actor_type    TEXT NOT NULL CHECK (actor_type IN ('user','asa','human','arep')),

  -- D-02 open. Nullable until an authority is named per actor type.
  external_ref  TEXT,

  -- Always present. AG-1050, ASA-BOT-02, MBR-20440, SES-90217.
  display_id    TEXT NOT NULL,

  -- NULL for anonymous sessions and ASA deployments. Revealing this for an
  -- identified actor is a distinct, auditable read — see v_roster, which does
  -- not expose it for members at all while ID-04 has no audit path.
  display_name  TEXT,

  -- ── The identity ladder (D-11) ────────────────────────────────────────────
  --   identified  logged in, or account id on a call · nameable · linkable
  --   ghost       durable key, never identified · not nameable · linkable
  --   guest       anonymous, one session only · not nameable · not linkable
  --   inferred    presence implied, never observed · neither
  --
  -- `ghost` carries the most weight and gets the least attention: a
  -- behavioural profile of a person you cannot name is still personal data in
  -- most jurisdictions. Pseudonymised, not anonymised.
  identity_rung TEXT NOT NULL DEFAULT 'identified'
                CHECK (identity_rung IN ('identified','ghost','guest','inferred')),

  -- ── ASA only ──────────────────────────────────────────────────────────────
  build_version   TEXT,
  provider        TEXT,
  instances_total INTEGER,
  instances_live  INTEGER,

  -- ── human only ────────────────────────────────────────────────────────────
  active        BOOLEAN NOT NULL DEFAULT true,

  attributes    JSONB NOT NULL DEFAULT '{}',   -- tenure, team, cohort
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),

  UNIQUE (org_id, actor_type, display_id),

  -- A name on an unnameable rung is a contradiction the schema should refuse
  -- rather than the interface hide. §5.1 makes pseudonymity enforceable here.
  CONSTRAINT actors_unnameable_has_no_name
    CHECK (identity_rung = 'identified' OR display_name IS NULL),

  -- Instance counts belong to deployments. On a person they are meaningless,
  -- and a meaningless number that sums into an availability figure is exactly
  -- the FR-20 failure in another costume.
  CONSTRAINT actors_instances_are_asa_only
    CHECK (actor_type = 'asa'
           OR (instances_total IS NULL AND instances_live IS NULL)),

  CONSTRAINT actors_instances_coherent
    CHECK (instances_total IS NULL
           OR (instances_live IS NOT NULL
               AND instances_live  >= 0
               AND instances_total >= instances_live))
);

CREATE INDEX idx_actors_org_type   ON actors (org_id, actor_type);
CREATE INDEX idx_actors_display_id ON actors (org_id, display_id);

ALTER TABLE actors ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_actors" ON actors FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE TRIGGER trg_actors_updated_at
  BEFORE UPDATE ON actors
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON actors TO bob_app;

COMMENT ON TABLE actors IS
  'Data Model §5.1. One table for humans, ASA deployments, members and '
  'anonymous sessions. An anonymous visitor is an actor: they had an '
  'interaction, and they can be counted, attributed and drilled into. One code '
  'path instead of two.';
COMMENT ON COLUMN actors.identity_rung IS
  'D-11. Four rungs, not a boolean. Widening this later would mean rewriting '
  'history, which is why it ships before anything reads it.';
COMMENT ON COLUMN actors.instances_live IS
  'D-27. Live instances of an ASA deployment. Summed by FR-21 — this is '
  'capacity, not volume, and it does not vary with timeframe. At connection '
  'something must keep this current (D-02, ASA line) or the figure freezes at '
  'its seeded value, silently and plausibly.';

COMMIT;
