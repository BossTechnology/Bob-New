-- ════════════════════════════════════════════════════════════════════════════
-- BOb v1 · tenancy fixture — two organisations that must never see each other.
--
-- NOT A MIGRATION, and deliberately not in supabase/migrations. A tenancy
-- fixture that ships in the migration chain is a tenancy fixture that reaches
-- production. The suite loads this into a freshly reset database.
--
-- Fixed UUIDs so assertions can name a tenant rather than discover one.
-- ════════════════════════════════════════════════════════════════════════════

INSERT INTO organizations (id, name, slug, plan) VALUES
  ('aaaaaaaa-0000-4000-8000-000000000001', 'Tenant A', 'tenant-a', 'growth'),
  ('bbbbbbbb-0000-4000-8000-000000000002', 'Tenant B', 'tenant-b', 'growth');

INSERT INTO users (id, org_id, email, full_name, role) VALUES
  ('aaaaaaaa-1111-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', 'a@example.test', 'A Admin', 'admin'),
  ('bbbbbbbb-1111-4000-8000-000000000002',
   'bbbbbbbb-0000-4000-8000-000000000002', 'b@example.test', 'B Admin', 'admin');

-- One channel each. A's is configured and emitting; B's is configured and not
-- yet emitting, so the SR-2 state has a fixture behind it from day one.
INSERT INTO channels (id, org_id, channel_type, display_name, source_key,
                      lag_seconds, adapter_kind) VALUES
  ('aaaaaaaa-2222-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', 'whatsapp', 'WhatsApp',
   'tenant-a.whatsapp', 0, 'signal_maker'),
  ('bbbbbbbb-2222-4000-8000-000000000002',
   'bbbbbbbb-0000-4000-8000-000000000002', 'voice', 'Voice',
   '__unset__:bbbbbbbb-2222-4000-8000-000000000002', 0, NULL);

-- One AutoBotz binding each, both with an explicit BR-3 ruling, because a
-- binding without one cannot be registered.
INSERT INTO autobotz (id, org_id, type, label, provider, reference,
                      scope_kind, mutative) VALUES
  ('aaaaaaaa-3333-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', 'synthetics', 'A checkout probe',
   'customer', 'https://a.example.test/probe', 'company', false),
  ('bbbbbbbb-3333-4000-8000-000000000002',
   'bbbbbbbb-0000-4000-8000-000000000002', 'webhook', 'B order hook',
   'bzzzbx', 'wh-b-001', 'company', true);

-- One company-scoped AutoComm entry each, for ID-11.
INSERT INTO notification_channels (id, org_id, type, label, values) VALUES
  ('aaaaaaaa-4444-4000-8000-000000000001',
   'aaaaaaaa-0000-4000-8000-000000000001', 'email', 'A ops', '{a@example.test}'),
  ('bbbbbbbb-4444-4000-8000-000000000002',
   'bbbbbbbb-0000-4000-8000-000000000002', 'email', 'B ops', '{b@example.test}');
