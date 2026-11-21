// Consistent API responses — Backend Discovery §5 (lib/api-response.ts).
//
// In the box (BOB_CAJA=1) no failure detail reaches the client: a database
// error is mapped by its code (lib/bob/db-error.ts) and anything else is a
// generic 500; the detail goes to the server log. Outside the box, as before.
import { isBox } from './bob/runtime.ts'
import { classifyDbError } from './bob/db-error.ts'

export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

export const ok = (data: unknown) => Response.json({ ok: true, data }, { status: 200 })
export const created = (data: unknown) => Response.json({ ok: true, data }, { status: 201 })
export const accepted = (data: unknown) => Response.json({ ok: true, data }, { status: 202 })
export const badReq = (msg: string) => Response.json({ ok: false, error: msg }, { status: 400 })
export const unauth = () => Response.json({ ok: false, error: 'Unauthorized' }, { status: 401 })
export const forbidden = () => Response.json({ ok: false, error: 'Forbidden' }, { status: 403 })
export const notFound = () => Response.json({ ok: false, error: 'Not found' }, { status: 404 })
export const tooMany = () => Response.json({ ok: false, error: 'Rate limit exceeded' }, { status: 429 })
export const serverErr = (e: unknown) => {
  if (isBox()) {
    console.error('[api]', e)
    const f = classifyDbError(e) ?? { status: 500, error: 'Internal error' }
    return Response.json({ ok: false, error: f.error }, { status: f.status })
  }
  return Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })
}

// Wraps a handler so thrown ApiError / Error map to the right status code.
export function handle(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status })
  }
  if (isBox()) return serverErr(error)
  console.error('[api]', error)
  return serverErr(error)
}
