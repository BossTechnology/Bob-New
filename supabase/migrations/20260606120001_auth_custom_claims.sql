-- ════════════════════════════════════════════════════════════════════════════
-- BOb — Authentication & custom JWT claims
-- Source: Backend Discovery §3.1 (custom JWT claims) + §2.1 (auth user link)
--
-- Faithful adaptations (required to make the doc's auth actually function):
--   1. §3.1 shows auth.custom_jwt_claims() returning a bare claims object. That
--      signature is not the shape Supabase's Auth Hook invokes. Implemented here
--      as the real `public.custom_access_token_hook(event jsonb)` contract that
--      injects org_id + role as TOP-LEVEL claims — exactly what the RLS policies
--      read via auth.jwt()->>'org_id'.
--   2. §2.1's handle_new_auth_user() inserts only (id, email), but users.org_id
--      is NOT NULL — so signup would fail. Refined to read org_id/role/full_name
--      from the new auth user's metadata (the /auth/signup route sets these after
--      creating the organization).
--
-- MANUAL STEP (cannot be done from SQL): enable the hook in the Supabase
-- Dashboard → Authentication → Hooks → "Custom Access Token" → select
-- public.custom_access_token_hook. Listed in SETUP.md.
-- ════════════════════════════════════════════════════════════════════════════

-- Refined auth → public.users linker (metadata-aware).
CREATE OR REPLACE FUNCTION public.handle_new_auth_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  INSERT INTO public.users (id, email, org_id, full_name, role)
  VALUES (
    NEW.id,
    NEW.email,
    NULLIF(NEW.raw_user_meta_data ->> 'org_id', '')::uuid,
    NEW.raw_user_meta_data ->> 'full_name',
    COALESCE(NEW.raw_user_meta_data ->> 'role', 'viewer')
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- Custom Access Token Hook — injects org_id, role, org_slug, plan as top-level
-- JWT claims on every token issue/refresh (§3.1).
CREATE OR REPLACE FUNCTION public.custom_access_token_hook(event jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE AS $$
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
    claims := jsonb_set(claims, '{org_id}', to_jsonb(u.org_id));
    claims := jsonb_set(claims, '{role}', to_jsonb(u.role));
    claims := jsonb_set(claims, '{org_slug}', to_jsonb(u.org_slug));
    claims := jsonb_set(claims, '{plan}', to_jsonb(u.plan));
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
END;
$$;

-- Grants required for the Auth admin role to run the hook and read users.
GRANT USAGE ON SCHEMA public TO supabase_auth_admin;
GRANT EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) TO supabase_auth_admin;
GRANT SELECT ON public.users, public.organizations TO supabase_auth_admin;
