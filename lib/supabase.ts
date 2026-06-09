import { createClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

type CookieToSet = { name: string; value: string; options: CookieOptions }

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY

// Service-role client — bypasses RLS. Backend Discovery §8.2: "Used only in
// cron routes and service functions." Never call from a user-reachable path
// without first validating the request.
export function getServiceClient() {
  if (!URL || !SERVICE) throw new Error('Supabase service env vars not configured')
  return createClient(URL, SERVICE, { auth: { persistSession: false } })
}

// Back-compat alias used by existing routes.
export const getSupabase = getServiceClient

// Route Handler client — respects RLS using the user's session cookie (§8.2).
export async function getRouteClient() {
  if (!URL || !ANON) throw new Error('Supabase public env vars not configured')
  const cookieStore = await cookies()
  return createServerClient(URL, ANON, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options))
        } catch {
          // setAll called from a Server Component — safe to ignore (proxy refreshes the session).
        }
      },
    },
  })
}
