// Consistent API responses — Backend Discovery §5 (lib/api-response.ts).

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
    this.name = 'ApiError'
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
export const serverErr = (e: unknown) =>
  Response.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 })

// Wraps a handler so thrown ApiError / Error map to the right status code.
export function handle(error: unknown): Response {
  if (error instanceof ApiError) {
    return Response.json({ ok: false, error: error.message }, { status: error.status })
  }
  console.error('[api]', error)
  return serverErr(error)
}
