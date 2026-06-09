-- ════════════════════════════════════════════════════════════════════════════
-- BOb — Security hardening for functions (Supabase advisors)
-- Fixes:
--   0011 function_search_path_mutable → pin search_path on all functions.
--   0028/0029 (anon|authenticated)_security_definer_function_executable →
--             revoke RPC EXECUTE on the SECURITY DEFINER trigger function.
-- The trigger keeps firing (trigger invocation does not require EXECUTE).
-- ════════════════════════════════════════════════════════════════════════════

ALTER FUNCTION public.update_updated_at() SET search_path = public;
ALTER FUNCTION public.cap_alert_log() SET search_path = public;
ALTER FUNCTION public.handle_new_auth_user() SET search_path = public;
ALTER FUNCTION public.custom_access_token_hook(jsonb) SET search_path = public;

-- handle_new_auth_user runs only from the auth.users trigger — not via the API.
REVOKE EXECUTE ON FUNCTION public.handle_new_auth_user() FROM public, anon, authenticated;

-- custom_access_token_hook is invoked only by the Auth server (supabase_auth_admin,
-- granted in the auth migration) — remove the default public RPC exposure.
REVOKE EXECUTE ON FUNCTION public.custom_access_token_hook(jsonb) FROM public, anon, authenticated;
