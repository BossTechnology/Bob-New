-- ════════════════════════════════════════════════════════════════════════════
-- BOb — Business Observer · Production Schema
-- Source: Backend Discovery Document v1.0 — Chapter 2 (Supabase Schema, §2.1–§2.7)
-- Transcribed verbatim. Multi-tenant: org_id isolation + RLS on every customer table.
--
-- Faithful adaptations (no schema content changed):
--   1. Reserved-word columns are double-quoted so the DDL executes on PostgreSQL:
--        anomalies."desc"            (DESC is a reserved keyword)
--        metric_snapshots."window"   (WINDOW is a reserved keyword)
--      Column names are preserved exactly as written in the document.
--   2. Idempotency guards (IF NOT EXISTS / OR REPLACE / DROP POLICY IF EXISTS) added
--      per the document's own migration rule (§11.2: "Each migration is idempotent").
--
-- Resolved doc inconsistency (§1.4 vs §2): the Cap. 2 DDL omits RLS on
-- `organizations`, `users` and `baselines`. Leaving them exposed via PostgREST
-- contradicts the §1.4 CRITICAL multi-tenancy rule (and the Supabase linter
-- flags it), so RLS IS enabled here with correct policies:
--   - organizations / users: members read their own org; the Auth admin role
--     (custom access-token hook) is granted SELECT so token issuance works.
--   - baselines: server-side only — RLS enabled with NO policy (service role
--     bypasses; anon/authenticated get no access).
-- ════════════════════════════════════════════════════════════════════════════


-- ═══════════════════════════════════════════════════
-- §2.1 FOUNDATION: Organizations & Users
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS organizations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  industry TEXT,
  plan TEXT NOT NULL DEFAULT 'starter'
    CHECK (plan IN ('starter','growth','enterprise')),
  active BOOLEAN DEFAULT TRUE,
  settings JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS users (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  email TEXT NOT NULL UNIQUE,
  full_name TEXT,
  role TEXT NOT NULL DEFAULT 'viewer'
    CHECK (role IN ('admin','analyst','viewer','demo','service')),
  active BOOLEAN DEFAULT TRUE,
  last_login_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_users_org ON users(org_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);

-- RLS for foundation tables (see header note). Reads only; writes go through the
-- service role / SECURITY DEFINER trigger, which bypass RLS.
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Members read their own organization.
DROP POLICY IF EXISTS "org_members_read_org" ON organizations;
CREATE POLICY "org_members_read_org" ON organizations FOR SELECT TO authenticated
  USING (id = (auth.jwt() ->> 'org_id')::uuid);

-- Members read users within their organization.
DROP POLICY IF EXISTS "org_members_read_users" ON users;
CREATE POLICY "org_members_read_users" ON users FOR SELECT TO authenticated
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- The Auth admin role must read users + organizations during token issuance
-- (custom access-token hook in the auth migration).
DROP POLICY IF EXISTS "auth_admin_read_orgs" ON organizations;
CREATE POLICY "auth_admin_read_orgs" ON organizations AS PERMISSIVE FOR SELECT
  TO supabase_auth_admin USING (true);
DROP POLICY IF EXISTS "auth_admin_read_users" ON users;
CREATE POLICY "auth_admin_read_users" ON users AS PERMISSIVE FOR SELECT
  TO supabase_auth_admin USING (true);

-- Supabase Auth integration: link auth.users to public.users
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.users (id, email)
  VALUES (NEW.id, NEW.email);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_auth_user();


-- ═══════════════════════════════════════════════════
-- §2.2 CHANNELS: Customer-configured channel definitions
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS channels (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_type TEXT NOT NULL
    CHECK (channel_type IN ('bot','whatsapp','voice','app','forms',
      'email','social','retail','google','tickets','chat','reddit')),
  display_name TEXT NOT NULL,
  active BOOLEAN DEFAULT TRUE,
  config JSONB DEFAULT '{}'::jsonb,             -- channel-specific config (API keys, webhook URLs)
  sentiment_profile JSONB DEFAULT '{}'::jsonb,  -- {angry:%, unsatisfied:%, ...} baseline weights
  metric_modifiers JSONB DEFAULT '{}'::jsonb,   -- {resMod, abaMod, escMod, aluMod, timeMod}
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_channels_org ON channels(org_id, active);

ALTER TABLE channels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_channels" ON channels;
CREATE POLICY "org_channels" ON channels FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);


-- ═══════════════════════════════════════════════════
-- §2.3 INTERACTIONS: Core event records
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS interactions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  channel_id TEXT NOT NULL,
  type TEXT NOT NULL
    CHECK (type IN ('resolved','abandoned','disambiguation','escalation','hallucination')),
  actor TEXT NOT NULL CHECK (actor IN ('customer','ai','human')),
  sentiment TEXT CHECK (sentiment IN ('angry','unsatisfied','satisfied','content','happy')),
  duration_ms INTEGER,
  escalation_reason TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_interactions_org_time ON interactions(org_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_channel ON interactions(org_id, channel_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_interactions_type ON interactions(org_id, type, occurred_at DESC);

ALTER TABLE interactions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_interactions" ON interactions;
CREATE POLICY "org_interactions" ON interactions FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- ═══════════════════════════════════════════════════
-- METRIC SNAPSHOTS: Pre-aggregated metric state
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS metric_snapshots (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  metric TEXT NOT NULL
    CHECK (metric IN ('sessions','avgtime','sentiment','res','aba','des','der','alu','quality')),
  channel_id TEXT NOT NULL DEFAULT 'all',
  "window" TEXT NOT NULL CHECK ("window" IN ('live','1h','24h','7d','30d')),
  total INTEGER NOT NULL DEFAULT 0,
  pct_customer INTEGER NOT NULL DEFAULT 0 CHECK (pct_customer BETWEEN 0 AND 100),
  pct_ai INTEGER NOT NULL DEFAULT 0 CHECK (pct_ai BETWEEN 0 AND 100),
  pct_human INTEGER NOT NULL DEFAULT 0 CHECK (pct_human BETWEEN 0 AND 100),
  CONSTRAINT pct_sum_100 CHECK (pct_customer + pct_ai + pct_human = 100),
  extra_data JSONB DEFAULT '{}'::jsonb,
  recorded_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_snapshots_org_metric
  ON metric_snapshots(org_id, metric, channel_id, recorded_at DESC);

ALTER TABLE metric_snapshots ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_snapshots" ON metric_snapshots;
CREATE POLICY "org_snapshots" ON metric_snapshots FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- ═══════════════════════════════════════════════════
-- SENTIMENT READINGS: Channel-level distribution
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS sentiment_readings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  channel_id TEXT NOT NULL DEFAULT 'all',
  angry INTEGER NOT NULL DEFAULT 0,
  unsatisfied INTEGER NOT NULL DEFAULT 0,
  satisfied INTEGER NOT NULL DEFAULT 0,
  content INTEGER NOT NULL DEFAULT 0,
  happy INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT sentiment_sum CHECK (angry+unsatisfied+satisfied+content+happy = 100),
  sample_size INTEGER NOT NULL DEFAULT 0,
  computed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sentiment_org
  ON sentiment_readings(org_id, channel_id, computed_at DESC);

ALTER TABLE sentiment_readings ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_sentiment" ON sentiment_readings;
CREATE POLICY "org_sentiment" ON sentiment_readings FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);


-- ═══════════════════════════════════════════════════
-- §2.4 NOTIFICATION RULES: Threshold configurations
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS notification_rules (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  metric_id TEXT NOT NULL,
  channel_id TEXT NOT NULL DEFAULT 'all',
  actor TEXT NOT NULL DEFAULT 'all',
  upper_threshold NUMERIC,
  lower_threshold NUMERIC,
  trend_threshold NUMERIC,
  trend_window_min INTEGER DEFAULT 30,
  keyword TEXT,
  keyword_position INTEGER,
  notify_email BOOLEAN DEFAULT FALSE,
  email_recipients TEXT[] DEFAULT ARRAY[]::TEXT[],
  notify_sms BOOLEAN DEFAULT FALSE,
  sms_recipients TEXT[] DEFAULT ARRAY[]::TEXT[],
  notify_slack BOOLEAN DEFAULT FALSE,
  slack_webhook TEXT,
  notify_call BOOLEAN DEFAULT FALSE,
  call_recipients TEXT[] DEFAULT ARRAY[]::TEXT[],
  suppression_min INTEGER DEFAULT 15,
  escalation_min INTEGER DEFAULT 30,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_rules_org_metric ON notification_rules(org_id, metric_id, active);

ALTER TABLE notification_rules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_rules" ON notification_rules;
CREATE POLICY "org_rules" ON notification_rules FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- ═══════════════════════════════════════════════════
-- ALERTS: Fired threshold breach events
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS alerts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  rule_id UUID REFERENCES notification_rules(id),
  metric_id TEXT NOT NULL,
  metric_name TEXT NOT NULL,
  channel_id TEXT NOT NULL DEFAULT 'all',
  actor TEXT NOT NULL DEFAULT 'all',
  breach_type TEXT NOT NULL CHECK (breach_type IN ('upper','lower','trend','keyword')),
  value NUMERIC NOT NULL,
  threshold NUMERIC NOT NULL,
  excess_pct NUMERIC,
  sev TEXT NOT NULL CHECK (sev IN ('critical','warning','info')),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','acknowledged','investigating','resolved','suppressed','expired')),
  keyword TEXT,
  notification_sent JSONB DEFAULT '{}'::jsonb,
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  acknowledged_at TIMESTAMPTZ,
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_alerts_org_status ON alerts(org_id, status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_metric ON alerts(org_id, metric_id, status);
CREATE INDEX IF NOT EXISTS idx_alerts_sev ON alerts(org_id, sev, status);

ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_alerts" ON alerts;
CREATE POLICY "org_alerts" ON alerts FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

CREATE TABLE IF NOT EXISTS notification_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  alert_id UUID NOT NULL REFERENCES alerts(id) ON DELETE CASCADE,
  channel TEXT NOT NULL CHECK (channel IN ('email','sms','call','slack')),
  recipient TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('sent','delivered','failed','retrying')),
  provider_ref TEXT,
  attempt_count INTEGER DEFAULT 1,
  sent_at TIMESTAMPTZ DEFAULT NOW(),
  delivered_at TIMESTAMPTZ,
  error_message TEXT
);

CREATE INDEX IF NOT EXISTS idx_notif_alert ON notification_log(alert_id);

ALTER TABLE notification_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_notif_log" ON notification_log;
CREATE POLICY "org_notif_log" ON notification_log FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);


-- ═══════════════════════════════════════════════════
-- §2.5 ANOMALIES: Statistical deviation signals
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS anomalies (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('anomaly','incident','issue')),
  sev TEXT NOT NULL CHECK (sev IN ('critical','warning','info')),
  metric TEXT NOT NULL,
  title TEXT NOT NULL CHECK (length(title) <= 60),
  "desc" TEXT CHECK (length("desc") <= 200),
  status TEXT NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','open','investigating','escalated','resolved')),
  channel_id TEXT,
  sigma NUMERIC,
  baseline NUMERIC,
  actual NUMERIC,
  related_ids UUID[] DEFAULT ARRAY[]::UUID[],
  parent_id UUID REFERENCES anomalies(id),
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  resolved_at TIMESTAMPTZ,
  resolution_note TEXT
);

CREATE INDEX IF NOT EXISTS idx_anomalies_org_status ON anomalies(org_id, status, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_anomalies_metric ON anomalies(org_id, metric, status);

ALTER TABLE anomalies ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_anomalies" ON anomalies;
CREATE POLICY "org_anomalies" ON anomalies FOR ALL
  USING (org_id = (auth.jwt() ->> 'org_id')::uuid);

-- Anomaly detection baselines (computed hourly)
-- NOTE: §2.5 defines this table WITHOUT RLS — transcribed as written.
CREATE TABLE IF NOT EXISTS baselines (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  metric TEXT NOT NULL,
  channel_id TEXT NOT NULL DEFAULT 'all',
  day_of_week INTEGER CHECK (day_of_week BETWEEN 0 AND 6),
  hour_of_day INTEGER CHECK (hour_of_day BETWEEN 0 AND 23),
  mean NUMERIC NOT NULL,
  stddev NUMERIC NOT NULL,
  sample_size INTEGER NOT NULL,
  computed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE (org_id, metric, channel_id, day_of_week, hour_of_day)
);

CREATE INDEX IF NOT EXISTS idx_baselines_lookup
  ON baselines(org_id, metric, channel_id, day_of_week, hour_of_day);

-- baselines is written/read only by the service role (AnomalyDetectionService).
-- Enable RLS with no policy → anon/authenticated have no access; service bypasses.
ALTER TABLE baselines ENABLE ROW LEVEL SECURITY;

-- ═══════════════════════════════════════════════════
-- PATTERNS & ROOT CAUSE
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS patterns (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('anomalies','alerts')),
  type TEXT NOT NULL CHECK (type IN ('time-based','causal-chain','co-occurrence')),
  title TEXT NOT NULL,
  detail TEXT,
  confidence INTEGER CHECK (confidence BETWEEN 0 AND 100),
  occurrences INTEGER DEFAULT 1,
  metrics TEXT[] DEFAULT ARRAY[]::TEXT[],
  channels TEXT[] DEFAULT ARRAY[]::TEXT[],
  first_seen TIMESTAMPTZ DEFAULT NOW(),
  last_seen TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS rootcause_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  context TEXT NOT NULL CHECK (context IN ('anomalies','alerts')),
  summary TEXT NOT NULL,
  chain TEXT[] NOT NULL,
  primary_trigger TEXT,
  confidence INTEGER,
  method TEXT CHECK (method IN ('rule-based','claude')),
  generated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE patterns ENABLE ROW LEVEL SECURITY;
ALTER TABLE rootcause_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_patterns" ON patterns;
CREATE POLICY "org_patterns" ON patterns FOR ALL USING (org_id=(auth.jwt()->>'org_id')::uuid);
DROP POLICY IF EXISTS "org_rootcause" ON rootcause_log;
CREATE POLICY "org_rootcause" ON rootcause_log FOR ALL USING (org_id=(auth.jwt()->>'org_id')::uuid);


-- ═══════════════════════════════════════════════════
-- §2.6 BOBEE: Conversation history
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS bobee_conversations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  session_id TEXT NOT NULL,
  metric_scope TEXT,                            -- null = global, or metric_id for scoped chat
  messages JSONB NOT NULL DEFAULT '[]'::jsonb,  -- [{role, content, timestamp}]
  token_count INTEGER DEFAULT 0,
  started_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_bobee_user_session ON bobee_conversations(user_id, session_id);

ALTER TABLE bobee_conversations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "own_conversations" ON bobee_conversations;
CREATE POLICY "own_conversations" ON bobee_conversations FOR ALL
  USING (user_id = auth.uid() AND org_id = (auth.jwt()->>'org_id')::uuid);

-- ═══════════════════════════════════════════════════
-- CONFIGURATIONS: Per-org dashboard settings
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS configurations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL DEFAULT 'default',
  lang TEXT NOT NULL DEFAULT 'es'
    CHECK (lang IN ('es','en','fr','pt')),
  industry TEXT,
  activity TEXT,
  logo_url TEXT,
  logo_mode TEXT CHECK (logo_mode IN ('upload','icon')),
  selected_icon TEXT,
  vol_setting INTEGER DEFAULT 3 CHECK (vol_setting BETWEEN 1 AND 5),
  speed_setting INTEGER DEFAULT 3 CHECK (speed_setting BETWEEN 1 AND 5),
  active_channels JSONB DEFAULT '[]'::jsonb,
  metric_cfg JSONB DEFAULT '{}'::jsonb,
  alert_log JSONB DEFAULT '[]'::jsonb,
  is_default BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_config_org ON configurations(org_id, is_default);

ALTER TABLE configurations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_config" ON configurations;
CREATE POLICY "org_config" ON configurations FOR ALL
  USING (org_id = (auth.jwt()->>'org_id')::uuid);

-- ═══════════════════════════════════════════════════
-- AUDIT LOG: All configuration changes
-- ═══════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS audit_log (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  org_id UUID NOT NULL,
  user_id UUID,
  action TEXT NOT NULL,                         -- e.g. "threshold.updated", "channel.added"
  table_name TEXT,
  record_id UUID,
  old_values JSONB,
  new_values JSONB,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_audit_org ON audit_log(org_id, created_at DESC);

ALTER TABLE audit_log ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "org_audit_read" ON audit_log;
CREATE POLICY "org_audit_read" ON audit_log FOR SELECT
  USING (org_id = (auth.jwt()->>'org_id')::uuid);
-- Only service role can INSERT to audit_log (no user can delete audit trail)


-- ═══════════════════════════════════════════════════
-- §2.7 DATABASE TRIGGERS & FUNCTIONS
-- ═══════════════════════════════════════════════════

-- Auto-update updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_organizations_updated_at
  BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_configurations_updated_at
  BEFORE UPDATE ON configurations FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE OR REPLACE TRIGGER trg_notification_rules_updated_at
  BEFORE UPDATE ON notification_rules FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Enforce alert log cap at 50 entries per org (matches simulation behaviour)
CREATE OR REPLACE FUNCTION cap_alert_log()
RETURNS TRIGGER AS $$
BEGIN
  DELETE FROM alerts WHERE org_id = NEW.org_id
  AND id NOT IN (
    SELECT id FROM alerts WHERE org_id = NEW.org_id
    ORDER BY occurred_at DESC LIMIT 50
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trg_cap_alerts
  AFTER INSERT ON alerts FOR EACH ROW EXECUTE FUNCTION cap_alert_log();
