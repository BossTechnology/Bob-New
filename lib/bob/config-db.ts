// The client the /api/config routes use for rule persistence.
//
// In the box: schema bob as bob_app under the box's org (tables.ts). Outside
// the box: PostgREST with the user's session, as before, so the Vercel demo
// is unchanged. The route code is the same in both; only the client differs.
import { getRouteClient } from '../supabase.ts'
import { isBox } from './runtime.ts'
import { bobTables } from './tables.ts'

type RouteClient = Awaited<ReturnType<typeof getRouteClient>>

export async function configDb(orgId: string): Promise<RouteClient> {
  if (isBox()) return bobTables(orgId) as unknown as RouteClient
  return getRouteClient()
}

// In the box an action response needs an AutoBotz binding (Slice 6); the
// simulator sends a webhook, which bob no longer has. Inventario (iii).
export const actionNeedsBinding = () => Response.json(
  { ok: false, error: 'Actions need an AutoBotz binding (Slice 6); not available in the box yet' },
  { status: 409 })
