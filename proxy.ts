// Backend Discovery §3.2 — Auth Guard.
// NOTE: in Next.js 16 "middleware" is renamed to "proxy" (file: proxy.ts,
// export `proxy`). Functionality is unchanged. Implemented with @supabase/ssr
// (the doc's @supabase/auth-helpers-nextjs is deprecated and not compatible
// with Next 16 / React 19).
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'

type CookieToSet = { name: string; value: string; options: CookieOptions }

// `/api/cron` is listed here because the scheduler calls it with a bearer token
// and no session cookie. Without it the guard answered every scheduled run with
// a 307 to /login, so the jobs never reached their handlers — and a 307 is not
// an error, so nothing surfaced it. These routes are not unprotected: each one
// calls requireCron(), which rejects anything without Bearer ${CRON_SECRET}.
const PUBLIC_PATHS = ['/login', '/signup', '/demo', '/auth', '/api/health', '/api/ai', '/api/cron']

export async function proxy(request: NextRequest) {
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const path = request.nextUrl.pathname

  if (PUBLIC_PATHS.some((p) => path.startsWith(p))) return response

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

// Exclude Next internals and static assets (incl. the static dashboard.html).
export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:html|svg|png|jpg|jpeg|gif|webp|ico|css|js|json|woff2?)$).*)'],
}
