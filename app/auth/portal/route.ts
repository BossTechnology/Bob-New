// POST /auth/portal — the BzzzBX portal's access token becomes BOb's session,
// once GoTrue answers for it (lib/bob/portal.ts). Box only.
import { NextRequest } from 'next/server'
import { handle, notFound } from '@/lib/api-response'
import { isBox, gotrueUrl, proxyHops } from '@/lib/bob/runtime.ts'
import { getUser } from '@/lib/bob/gotrue.ts'
import { requestJar } from '@/lib/bob/box-auth.ts'
import { clientIp } from '@/lib/bob/login.ts'
import { ADOPT_ATTEMPTS, adoptPortalToken } from '@/lib/bob/portal.ts'

export async function POST(request: NextRequest) {
  try {
    if (!isBox()) return notFound()
    const ip = clientIp(request.headers.get('x-forwarded-for'), proxyHops())
    return await adoptPortalToken(await request.json().catch(() => null), ip, await requestJar(), {
      getUser: (t) => getUser(gotrueUrl(), t),
      budget: ADOPT_ATTEMPTS,
    })
  } catch (e) {
    return handle(e)
  }
}
