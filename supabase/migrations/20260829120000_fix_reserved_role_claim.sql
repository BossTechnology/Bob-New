-- ════════════════════════════════════════════════════════════════════════════
-- BOb — Fix the reserved `role` JWT claim
--
-- BUG: custom_access_token_hook overwrote the `role` claim with the
-- application role (admin / analyst / viewer). `role` is RESERVED by Supabase:
-- PostgREST reads it to decide which Postgres role to SET LOCAL ROLE to. With
-- role="admin" every user-scoped query failed with
--     22023: role "admin" does not exist
-- which 500'd every endpoint built on getRouteClient() — /api/config/*,
-- /api/metrics, /api/alerts, /api/anomalies, /api/sentiment, /api/channels.
-- Only service-client routes (/api/health) were unaffected.
--
-- FIX: leave `role` untouched (Supabase sets it to `authenticated`) and publish
-- the application role as `app_role`. Backend Discovery §3.1 named the claim
-- `role`; that name is not available to us, so `app_role` replaces it.
--
-- No RLS policy referenced the `role` claim (verified against pg_policies), so
-- nothing else changes. lib/auth.ts reads `app_role` in the same commit.
--
-- Sessions issued before this migration still carry the bad claim; they heal on
-- the next token refresh (≤1h) or immediately on re-login.
-- ════════════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  claims jsonb;
  u RECORD;
BEGIN
  SELECT usr.org_id, usr.role, org.slug AS org_slug, org.plan
  INTO u
  FROM public.users usr
  JOIN public.organizations org ON org.id = usr.org_id
  WHERE usr.id = (event ->> 'user_id')::uuid;

  claims := event -> 'claims';
  IF u.org_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{org_id}',   to_jsonb(u.org_id));
    -- `role` is reserved for PostgREST — publish the app role separately.
    claims := jsonb_set(claims, '{app_role}', to_jsonb(u.role));
    claims := jsonb_set(claims, '{org_slug}', to_jsonb(u.org_slug));
    claims := jsonb_set(claims, '{plan}',     to_jsonb(u.plan));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Re-assert the hardening from 20260606120003 (CREATE OR REPLACE can reset it).
ALTER FUNCTION public.custom_access_token_hook(jsonb) SET search_path = public;
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
