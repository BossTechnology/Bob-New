-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · Slice 1 · Migration 2 of 4
-- `channel_actor_mix` — closes F-06.
--
-- NO STEP IN THE MIGRATION ORDER. The table is listed in Handoff §4.1 under
-- Configuration and ruled load-bearing by C-07, and exists in no migration.
-- Recorded as amendment A-08.
--
-- WHY IT IS SLICE 1 AND NOT SLICE 2. The simulator opens buildHumanRoster()
-- with `activeChannels.filter(id => chMix(id).h)`. Human availability is scoped
-- to channels whose mix carries humans, and FR-23's required explanation — "no
-- selected channel carries human agents" — is read off this table. There is no
-- other source for it. FR-23 is in Slice 1, so this is too.
--
-- RULING APPLIED — C-07 / Q13. `present` and nothing else. A `share` or `bias`
-- column is PERMANENTLY unnecessary: attribution reads the observed split from
-- proj_metric_counts, and multiplying an observed split by an assumed one
-- double-counts. Technical Architecture Part 2 is exact on the operations and
-- superseded on the inputs. A column nobody may use is a column somebody will.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

CREATE TABLE channel_actor_mix (
  org_id     UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id UUID NOT NULL REFERENCES channels(id)      ON DELETE CASCADE,

  -- All four types. The simulator's mix returns {u, a, h, arep} and
  -- actors.actor_type already admits arep; omitting it would make an ARep
  -- unrepresentable on a channel it works.
  actor_type TEXT NOT NULL CHECK (actor_type IN ('user','asa','human','arep')),

  -- The whole table. TRUE means this channel carries actors of this type.
  present    BOOLEAN NOT NULL,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  PRIMARY KEY (org_id, channel_id, actor_type)
);

CREATE INDEX idx_cam_present
  ON channel_actor_mix (org_id, actor_type, channel_id) WHERE present;

ALTER TABLE channel_actor_mix ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_channel_actor_mix" ON channel_actor_mix FOR ALL
  USING      (org_id = (auth.jwt() ->> 'org_id')::uuid)
  WITH CHECK (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE TRIGGER trg_channel_actor_mix_updated_at
  BEFORE UPDATE ON channel_actor_mix
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

GRANT SELECT, INSERT, UPDATE, DELETE ON channel_actor_mix TO bob_app;

-- PR-10, one level up. A channel with no row for an actor type is NOT
-- OBSERVED — nobody has said whether it carries humans. A row with
-- present = false is OBSERVED AND NONE — somebody has said it does not.
-- FR-23 needs to tell a user which of those it is, so the absence of a row is
-- meaningful and must not be defaulted away.
COMMENT ON TABLE channel_actor_mix IS
  'C-07. Which actor types operate on which channel. `present` is load-bearing '
  'for FR-11, FR-23, UI-03 and PR-10. A missing row means not declared; '
  'present = false means declared absent. The two are different answers.';

COMMIT;
