// Backend Discovery §3.2 — Auth Guard.
// NOTE: in Next.js 16 "middleware" is renamed to "proxy" (file: proxy.ts,
// export `proxy`). Functionality is unchanged. Implemented with @supabase/ssr
// (the doc's @supabase/auth-helpers-nextjs is deprecated and not compatible
// with Next 16 / React 19).
//
// BOB_CAJA=1 (BOb v1 inside a box) takes a different path, boxProxy()
// (lib/bob/box-proxy.ts): an allowlist of routes, the session checked against
// the box's GoTrue on every request, the role in bob.users, and failing
// closed. See docs/bob-schema-data-layer/inventario.md.
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { isBox } from '@/lib/bob/runtime.ts'
import { boxProxy } from '@/lib/bob/box-proxy.ts'

type CookieToSet = { name: string; value: string; options: CookieOptions }

// What the matcher used to leave out, outside the box.
const STATIC = /^\/(?:_next\/image|favicon\.ico)$|\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|json|woff2?)$/

// `/api/cron` is listed here because the scheduler calls it with a bearer token
// and no session cookie. Without it the guard answered every scheduled run with
// a 307 to /login, so the jobs never reached their handlers — and a 307 is not
// an error, so nothing surfaced it. These routes are not unprotected: each one
// calls requireCron(), which rejects anything without Bearer ${CRON_SECRET}.
const PUBLIC_PATHS = ['/login', '/signup', '/demo', '/auth', '/api/health', '/api/ai', '/api/cron']

export async function proxy(request: NextRequest) {
  if (isBox()) return boxProxy(request)
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const path = request.nextUrl.pathname

  // Static files pass, as when the matcher left them out (it now sees them
  // so that the box can close them).
  if (STATIC.test(path)) return response
  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return response
  // The static simulator stays public outside the box, as before the matcher
  // listed it (it is only matched so the box can close it).
  if (path.endsWith('.html')) return response

  // If Supabase isn't configured yet, don't hard-block (lets the seeded demo
  // dashboard load during setup). Auth enforcement activates once env is set.
  if (!url || !anon) return response

  const supabase = createServerClient(url, anon, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet: CookieToSet[]) {
        cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value))
        response = NextResponse.next({ request })
        cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options))
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return NextResponse.redirect(new URL('/login', request.url))
  }
  return response
}

// Every request but Next's static chunks. In the box, boxProxy decides on
// each one (an API route ending in .json is still a route: review of PR #30,
// point 4). Outside the box, static files pass as before (STATIC above).
export const config = {
  matcher: ['/((?!_next/static).*)'],
}
