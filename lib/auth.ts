// Auth helpers for API routes — Backend Discovery §3.3 / §3.4.
import { getRouteClient } from './supabase'
import { ApiError } from './api-response'
import type { AuthContext } from './types'

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split('.')[1]
    const json = Buffer.from(payload.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8')
    return JSON.parse(json)
  } catch {
    return {}
  }
}

// User-session auth. org_id and app_role are read from top-level JWT claims
// injected by the Supabase custom access-token hook (§3.1). The doc names the
// role claim `role`, but that name is reserved by Supabase — PostgREST reads it
// to pick the Postgres role, and an app value like "admin" breaks every query
// with `role "admin" does not exist`. It is published as `app_role` instead.
// Throws ApiError on failure.
export async function requireAuth(
  allowedRoles: string[] = ['admin', 'analyst', 'viewer'],
): Promise<AuthContext> {
  const supabase = await getRouteClient()
  const { data: { session }, error } = await supabase.auth.getSession()
  if (error || !session) throw new ApiError(401, 'Unauthorized')

  const claims = decodeJwtPayload(session.access_token)
  const org_id = (claims.org_id as string) || ''
  const role = (claims.app_role as string) || 'viewer'

  if (!org_id) {
    throw new ApiError(401, 'Missing org_id claim — custom access-token hook not configured')
  }
  if (!allowedRoles.includes(role)) {
    throw new ApiError(403, `Role ${role} is not permitted for this endpoint`)
  }
  return { user_id: session.user.id, org_id, role }
}

// Service-to-service auth (§3.4). Used by ingestion / notification routes.
export function requireService(request: Request): void {
  const key = request.headers.get('x-internal-api-key')
  if (!process.env.INTERNAL_SERVICE_API_KEY || key !== process.env.INTERNAL_SERVICE_API_KEY) {
    throw new ApiError(401, 'Invalid service key')
  }
}

// Vercel Cron auth (§7.2). Validates the Bearer CRON_SECRET header.
export function requireCron(request: Request): void {
  const authHeader = request.headers.get('Authorization')
  if (!process.env.CRON_SECRET || authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    throw new ApiError(401, 'Unauthorized')
  }
}
