-- ════════════════════════════════════════════════════════════════════════════
-- BOb — Enable Supabase Realtime (§6.1 / §8.2)
-- Adds the live-update tables to the default `supabase_realtime` publication so
-- the frontend receives row-change events over WebSocket.
--   metric_snapshots, alerts, anomalies, sentiment_readings
-- (audit_log / notification_log are intentionally excluded — high-write, no RT.)
--
-- Idempotent: skips tables already in the publication.
-- ════════════════════════════════════════════════════════════════════════════

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['metric_snapshots', 'alerts', 'anomalies', 'sentiment_readings'];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;
