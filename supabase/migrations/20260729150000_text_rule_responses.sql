-- ═══════════════════════════════════════════════════════════════════
-- BOb Simulator v3 — Text Rule Responses (phase 3c follow-up)
-- Adds the missing link so Alert/Alarm/Action responses attached to a
-- content rule (temas/acciones/faq/words) can persist and dispatch,
-- matching the threshold_id / anomaly_rule_id links already on
-- response_rules. Additive, backwards compatible.
-- ═══════════════════════════════════════════════════════════════════

ALTER TABLE response_rules
  ADD COLUMN IF NOT EXISTS text_rule_id UUID REFERENCES text_rules(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_rr_textrule ON response_rules(text_rule_id);
