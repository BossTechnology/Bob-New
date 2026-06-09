-- ════════════════════════════════════════════════════════════════════════════
-- BOb — Drop legacy single-tenant tables (runs BEFORE the multi-tenant schema)
--
-- WHY: an earlier deployment applied supabase/schema.sql, which created
-- single-tenant tables WITHOUT an org_id column. The multi-tenant schema uses
-- `CREATE TABLE IF NOT EXISTS`, so it would skip these pre-existing tables and
-- then fail creating indexes/policies on org_id (ERROR 42703: column "org_id"
-- does not exist). Dropping the colliding legacy tables lets the new schema
-- create them fresh with org_id + RLS.
--
-- Only the tables REDEFINED by the multi-tenant schema are dropped. The legacy
-- `sessions` and `alerts_log` tables are left untouched.
--
-- ⚠ Destructive: removes old demo/seed rows in these tables. Intended for the
-- dev project where schema.sql was previously applied. Back up first if needed.
-- ════════════════════════════════════════════════════════════════════════════

DROP TABLE IF EXISTS rootcause_log CASCADE;
DROP TABLE IF EXISTS patterns CASCADE;
DROP TABLE IF EXISTS anomalies CASCADE;
DROP TABLE IF EXISTS alerts CASCADE;

-- Also drop the original scaffold tables (not part of the doc's schema; the new
-- architecture stores dashboard config in `configurations` per §2.6).
DROP TABLE IF EXISTS sessions CASCADE;
DROP TABLE IF EXISTS alerts_log CASCADE;
