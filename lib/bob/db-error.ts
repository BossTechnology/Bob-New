// A database failure in the box, as an Error with its code, and the HTTP
// status each kind of failure maps to. The message stays in the server log:
// a pg error can name a host, a port, a login or a table.
export class BobDbError extends Error {
  code?: string
  constructor(message: string, code?: string) {
    super(message)
    this.name = 'BobDbError'
    this.code = code
  }
}

// Network errors from node, pg's own pool timeout, and the Postgres classes
// that mean "the database is not there for us right now".
const UNAVAILABLE_NET = new Set(['ECONNREFUSED', 'ECONNRESET', 'ETIMEDOUT', 'ENOTFOUND', 'EHOSTUNREACH', 'EAI_AGAIN'])

export type DbFailure = { status: number; error: string }

export function classifyDbError(e: unknown): DbFailure | null {
  const code = typeof e === 'object' && e && 'code' in e ? String((e as { code: unknown }).code) : ''
  const message = e instanceof Error ? e.message : typeof e === 'object' && e && 'message' in e
    ? String((e as { message: unknown }).message) : ''
  if (UNAVAILABLE_NET.has(code) || /^08/.test(code) || /^28/.test(code) || /^57P0/.test(code)
    || code === '57014' || /timeout exceeded when trying to connect|Connection terminated/.test(message)) {
    return { status: 503, error: 'Database unavailable' }
  }
  switch (code) {
    case '23505': return { status: 409, error: 'Already exists' }
    case '42501': return { status: 403, error: 'Forbidden' }
    case 'PGRST116': return { status: 404, error: 'Not found' }
    case '23502': case '23503': case '23514': case '22P02': case '22007': case '22008': case '22023':
    case 'BOB_QUERY':
      return { status: 400, error: 'Invalid request' }
  }
  return null
}
