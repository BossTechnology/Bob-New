// Backend Discovery §3.2 — Auth Guard.
// NOTE: in Next.js 16 "middleware" is renamed to "proxy" (file: proxy.ts,
// export `proxy`). Functionality is unchanged. Implemented with @supabase/ssr
// (the doc's @supabase/auth-helpers-nextjs is deprecated and not compatible
// with Next 16 / React 19).
//
// BOB_CAJA=1 (BOb v1 inside a box) takes a different path, boxProxy(): an
// allowlist of routes (lib/bob/surface.ts), the session checked against the
// box's GoTrue on every request, and failing closed. See
// docs/bob-schema-data-layer/inventario.md.
import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { isBox, gotrueUrl } from '@/lib/bob/runtime.ts'
import { boxAccess } from '@/lib/bob/surface.ts'
import { resolveSession, type CookieJar, type CookieOptions as BobCookieOptions } from '@/lib/bob/session.ts'

type CookieToSet = { name: string; value: string; options: CookieOptions }

// `/api/cron` is listed here because the scheduler calls it with a bearer token
// and no session cookie. Without it the guard answered every scheduled run with
// a 307 to /login, so the jobs never reached their handlers — and a 307 is not
// an error, so nothing surfaced it. These routes are not unprotected: each one
// calls requireCron(), which rejects anything without Bearer ${CRON_SECRET}.
const PUBLIC_PATHS = ['/login', '/signup', '/demo', '/auth', '/api/health', '/api/ai', '/api/cron']

const plain = (status: number, body: string) =>
  new NextResponse(body, { status, headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store' } })

// In the box, insumos de Bzzz §3.5: no configuration is a 503, GoTrue down is
// a 503 (not /login: that would loop against the same dead GoTrue), GoTrue's
// 401 is the login. Nothing is let through on a doubt.
async function boxProxy(request: NextRequest) {
  const path = request.nextUrl.pathname
  const access = boxAccess(path)
  if (access === 'off') return plain(404, 'Not found')
  if (access === 'public') return NextResponse.next({ request })

  let base: string
  try {
    base = gotrueUrl()
  } catch {
    return plain(503, 'BOb no tiene configurada la identidad de la caja.')
  }

  const pending: [string, string, BobCookieOptions][] = []
  const jar: CookieJar = {
    get: (n) => request.cookies.get(n)?.value || undefined,
    set: (n, v, o) => { pending.push([n, v, o]); request.cookies.set(n, v) },
  }
  const s = await resolveSession(jar, base)
  const isApi = path.startsWith('/api/') || path.startsWith('/auth/')
  let response: NextResponse
  if (s.kind === 'unavailable') {
    response = isApi
      ? NextResponse.json({ ok: false, error: 'identity unavailable' }, { status: 503 })
      : plain(503, 'La identidad de la caja no responde. BOb no sirve nada hasta que vuelva.')
  } else if (s.kind === 'none') {
    response = isApi
      ? NextResponse.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
      : NextResponse.redirect(new URL('/login', request.url))
  } else {
    response = NextResponse.next({ request })
  }
  for (const [n, v, o] of pending) response.cookies.set(n, v, o)
  return response
}

export async function proxy(request: NextRequest) {
  if (isBox()) return boxProxy(request)
  let response = NextResponse.next({ request })

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const path = request.nextUrl.pathname

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

// Exclude Next internals and static assets (incl. the static dashboard.html).
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:html|svg|png|jpg|jpeg|gif|webp|ico|css|js|json|woff2?)$).*)',
    '/dashboard.html', '/coop.html',
  ],
}
