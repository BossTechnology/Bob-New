-- BOb Demo Stack — Full Supabase Schema
-- Run this in the Supabase SQL Editor: supabase.com > Project > SQL Editor

-- ── Existing tables ───────────────────────────────────────────────────────────

create table if not exists sessions (
  id         uuid primary key default gen_random_uuid(),
  config     jsonb not null,
  created_at timestamptz not null default now()
);

create table if not exists alerts_log (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid references sessions(id) on delete set null,
  metric      text not null,
  threshold   numeric,
  value       numeric,
  channel     text not null check (channel in ('email', 'sms', 'voice')),
  recipient   text not null,
  status      text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at  timestamptz not null default now()
);

-- ── Anomalies & Alerts Module ─────────────────────────────────────────────────

create table if not exists anomalies (
  id          uuid primary key default gen_random_uuid(),
  type        text not null check (type in ('anomaly','incident','issue')),
  sev         text not null check (sev in ('critical','warning','info')),
  metric      text not null,
  title       text not null,
  description text,
  status      text not null default 'active'
              check (status in ('active','open','investigating','escalated','resolved')),
  channel_id  text,
  sigma       numeric,
  baseline    numeric,
  actual      numeric,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists alerts (
  id          uuid primary key default gen_random_uuid(),
  metric_id   text not null,
  metric_name text not null,
  breach_type text not null check (breach_type in ('upper','lower')),
  value       numeric not null,
  threshold   numeric not null,
  sev         text not null check (sev in ('critical','warning')),
  channel_id  text,
  occurred_at timestamptz not null default now()
);

create table if not exists patterns (
  id          uuid primary key default gen_random_uuid(),
  context     text not null check (context in ('anomalies','alerts')),
  type        text not null,
  title       text not null,
  detail      text,
  confidence  integer,
  occurrences integer default 1,
  metrics     text[],
  channels    text[],
  first_seen  timestamptz default now(),
  last_seen   timestamptz default now()
);

create table if not exists rootcause_log (
  id              uuid primary key default gen_random_uuid(),
  context         text not null,
  summary         text not null,
  chain           text[] not null,
  primary_trigger text,
  confidence      integer,
  generated_at    timestamptz default now()
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

create index if not exists idx_anomalies_status   on anomalies(status);
create index if not exists idx_anomalies_metric   on anomalies(metric, occurred_at desc);
create index if not exists idx_alerts_occurred    on alerts(occurred_at desc);
create index if not exists idx_patterns_context   on patterns(context);
create index if not exists idx_rootcause_context  on rootcause_log(context, generated_at desc);

-- ── RLS (service role bypasses; anon has no access) ──────────────────────────

alter table sessions      enable row level security;
alter table alerts_log    enable row level security;
alter table anomalies     enable row level security;
alter table alerts        enable row level security;
alter table patterns      enable row level security;
alter table rootcause_log enable row level security;

-- ── Seed data (realistic demo) ────────────────────────────────────────────────

insert into anomalies (type, sev, metric, title, description, status, occurred_at) values
  ('anomaly',  'warning',  'sessions', 'Session volume deviation',
   'Volume 2.3σ above 7-day baseline during off-peak window. Possible viral campaign or external referral spike.',
   'active',       now() - interval '25 min'),
  ('anomaly',  'critical', 'aba',      'Abandonment rate spike',
   'Abandonment rate exceeds predicted upper bound by 3.1σ. WhatsApp channel most affected.',
   'active',       now() - interval '18 min'),
  ('anomaly',  'warning',  'avgtime',  'Response time drift',
   'Avg response time tracking 1.8σ above seasonal baseline. AI agent resolution times normal — human agent lag.',
   'active',       now() - interval '54 min'),
  ('anomaly',  'info',     'sentiment','Positive sentiment surge',
   'Happy + Content sentiment 1.4σ above baseline — correlates with recent product update rollout.',
   'resolved',     now() - interval '2 hours'),
  ('incident', 'critical', 'alu',      'Hallucination rate critical',
   'AI hallucination rate crossed critical threshold on WhatsApp channel. Likely caused by out-of-scope product queries.',
   'open',         now() - interval '34 min'),
  ('incident', 'warning',  'der',      'Escalation cluster detected',
   'Unusual escalation pattern on Voice channel — 4 escalations in 12 min. Possible IVR routing issue.',
   'open',         now() - interval '1 hour 1 min'),
  ('incident', 'critical', 'aba',      'Abandonment cascade — Forms',
   'Web Forms channel abandonment reached 78% in last 15 min. Possible form rendering issue on mobile.',
   'investigating', now() - interval '11 min'),
  ('issue',    'warning',  'des',      'Disambiguation loop pattern',
   '3 related disambiguation anomalies on BOT channel in 2 hours — probable intent coverage gap in NLU model.',
   'investigating', now() - interval '1 hour 29 min'),
  ('issue',    'critical', 'aba',      'Multi-channel abandonment pattern',
   '2 incidents (WhatsApp + Voice) grouped — root cause identified: upstream CRM latency >4s causing timeouts.',
   'escalated',    now() - interval '1 hour 54 min'),
  ('issue',    'warning',  'avgtime',  'Peak-hour response degradation',
   'Response time incidents on Voice and Forms correlated with peak load 09:00–11:00. Recurring 3 days.',
   'open',         now() - interval '2 hours 39 min')
on conflict do nothing;

insert into alerts (metric_id, metric_name, breach_type, value, threshold, sev, occurred_at) values
  ('aba',     'Abandonados',   'upper', 43, 40, 'critical', now() - interval '26 min'),
  ('alu',     'Alucinaciones', 'upper', 23, 20, 'warning',  now() - interval '1 hour 2 min'),
  ('avgtime', 'Tiempo Prom.',  'upper', 18, 15, 'warning',  now() - interval '1 hour 34 min')
on conflict do nothing;
