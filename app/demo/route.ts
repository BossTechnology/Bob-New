// §12.2 Demo Mode entry — public. Forwards to the dashboard, preserving query
// (industry, lang, token). The seeded demo org provides the data.
import { NextRequest } from 'next/server'

export function GET(request: NextRequest) {
  const qs = request.nextUrl.search || ''
  return Response.redirect(new URL(`/dashboard.html${qs}`, request.url))
}
