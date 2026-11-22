// Signing in to the box: throttled per account and per address, and every
// decision recorded (ASVS 4.0.3 V2.2.1, V7.2.1; docs/asvs-l2-box.md).
//
// The counts live in this process: one bob-web container per box. A restart
// clears them.
import { createHash } from 'node:crypto'
import { badReq, ok, tooMany, unauth } from '../api-response.ts'
import type { GoTrueSession, SessionResult } from './gotrue.ts'
import { securityLine } from './security-log.ts'

export class Attempts {
  private hits = new Map<string, number[]>()
  private swept = 0
  private limit: number
  private windowMs: number
  private now: () => number

  constructor(limit: number, windowMs: number, now: () => number = Date.now) {
    this.limit = limit
    this.windowMs = windowMs
    this.now = now
  }

  get size() { return this.hits.size }

  // Counts the attempt before it is made, so parallel guesses count too.
  take(key: string): boolean {
    const now = this.now()
    const since = now - this.windowMs
    if (this.swept <= since) {
      for (const [k, times] of this.hits) if (times[times.length - 1] <= since) this.hits.delete(k)
      this.swept = now
    }
    const recent = (this.hits.get(key) ?? []).filter((t) => t > since)
    if (recent.length >= this.limit) return false
    recent.push(now)
    this.hits.set(key, recent)
    return true
  }

  clear(key: string) { this.hits.delete(key) }
}

// The proxy in front appends the address it saw; what comes before it is
// whatever the client sent.
export const clientIp = (forwardedFor: string | null) =>
  forwardedFor?.split(',').at(-1)?.trim().slice(0, 64) || 'unknown'

export type LoginDeps = {
  grant: (email: string, password: string) => Promise<SessionResult>
  setSession: (session: GoTrueSession) => Promise<void>
  byIp: Attempts
  byAccount: Attempts
  log: (line: string) => void
}

// 20 attempts in 15 minutes is at most 80 an hour on one account; the
// standard allows 100. 10 a minute per address is what the route had.
export const LOGIN_ATTEMPTS = {
  byIp: new Attempts(10, 60_000),
  byAccount: new Attempts(20, 15 * 60_000),
  log: (line: string) => console.info(line),
}

const MAX_EMAIL = 320
const MAX_PASSWORD = 1024

export async function boxLogin(body: unknown, ip: string, deps: LoginDeps): Promise<Response> {
  const { email, password } = (body ?? {}) as { email?: unknown; password?: unknown }
  if (typeof email !== 'string' || typeof password !== 'string' || !email || !password
    || email.length > MAX_EMAIL || password.length > MAX_PASSWORD) {
    return badReq('Missing email/password')
  }
  // The log names the account by a hash: enough to follow one account's
  // attempts without writing its email down.
  const account = createHash('sha256').update(email.trim().toLowerCase()).digest('hex').slice(0, 16)
  const record = (event: string) => deps.log(securityLine(event, { account, ip }))

  if (!deps.byIp.take(ip) || !deps.byAccount.take(account)) {
    record('login.throttled')
    return tooMany()
  }
  const g = await deps.grant(email, password)
  if (g.kind === 'unavailable') {
    record('login.unavailable')
    return Response.json({ ok: false, error: 'Identity unavailable' }, { status: 503 })
  }
  if (g.kind === 'unauthorized') {
    record('login.refused')
    return unauth()
  }
  deps.byAccount.clear(account)
  await deps.setSession(g.session)
  record('login.ok')
  return ok({ next: '/bob/performance' })
}
