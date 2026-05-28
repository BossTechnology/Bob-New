-- BOb Demo Stack — Supabase Schema
-- Run this in the Supabase SQL Editor: supabase.com > Project > SQL Editor

-- Demo sessions (config snapshots that can be shared via URL)
create table if not exists sessions (
  id          uuid primary key default gen_random_uuid(),
  config      jsonb not null,
  created_at  timestamptz not null default now()
);

-- Alert log (for future Resend/Twilio notifications)
create table if not exists alerts (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid references sessions(id) on delete set null,
  metric       text not null,
  threshold    numeric,
  value        numeric,
  channel      text not null check (channel in ('email', 'sms', 'voice')),
  recipient    text not null,
  status       text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  created_at   timestamptz not null default now()
);

-- Enable Row Level Security (sessions are public for demo purposes)
alter table sessions enable row level security;
alter table alerts enable row level security;

-- Allow server-side service role full access (no anon access)
create policy "service_role_sessions" on sessions
  using (true)
  with check (true);

create policy "service_role_alerts" on alerts
  using (true)
  with check (true);
