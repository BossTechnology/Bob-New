// Signing in to the box: throttled per account and per address, and every
// decision recorded (ASVS 4.0.3 V2.2.1, V7.2.1; docs/asvs-l2-box.md).
//
// The counts live in this process: one bob-web container per box. A restart
// clears them.
import { createHmac, randomBytes } from 'node:crypto'
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

// Addresses an account has signed in from, for a while. Failures from one of
// them count against that address alone, so a stranger who only knows the
// email cannot lock its owner out of a place they already use.
export class KnownAddresses {
  private until = new Map<string, number>()
  private ttlMs: number
  private cap: number
  private now: () => number

  constructor(ttlMs: number, cap: number, now: () => number = Date.now) {
    this.ttlMs = ttlMs
    this.cap = cap
    this.now = now
  }

  get size() { return this.until.size }

  has(key: string): boolean {
    const t = this.until.get(key)
    if (t === undefined) return false
    if (t > this.now()) return true
    this.until.delete(key)
    return false
  }

  add(key: string) {
    this.until.delete(key)
    this.until.set(key, this.now() + this.ttlMs)
    // Oldest first: Map keeps insertion order.
    while (this.until.size > this.cap) this.until.delete(this.until.keys().next().value as string)
  }
}

// Each trusted proxy appends the address it saw. The client is the entry the
// outermost one wrote (`hops` from the end); anything before it is whatever
// the client sent. Fewer entries than proxies means the request did not come
// through them, and all such requests share one bucket.
export function clientIp(forwardedFor: string | null, hops: number): string {
  const entries = (forwardedFor ?? '').split(',').map((e) => e.trim()).filter(Boolean)
  return entries.length >= hops ? entries[entries.length - hops].slice(0, 64) : 'direct'
}

// The log names the account by a keyed hash: enough to follow one account's
// attempts in this process without writing its email down, and not something
// a reader of the log can match against a list of emails. The key changes on
// restart.
const ACCOUNT_KEY = randomBytes(32)
export const accountKey = (email: string) =>
  createHmac('sha256', ACCOUNT_KEY).update(email.trim().toLowerCase()).digest('hex').slice(0, 32)

export type LoginDeps = {
  grant: (email: string, password: string) => Promise<SessionResult>
  setSession: (session: GoTrueSession) => Promise<void>
  byIp: Attempts
  byAccount: Attempts
  byKnown: Attempts
  known: KnownAddresses
  log: (line: string) => void
}

// 20 attempts in 15 minutes is at most 80 an hour on one account; the
// standard allows 100. 10 a minute per address is what the route had. An
// address the account signed in from in the last 30 days has its own 20.
export const LOGIN_ATTEMPTS = {
  byIp: new Attempts(10, 60_000),
  byAccount: new Attempts(20, 15 * 60_000),
  byKnown: new Attempts(20, 15 * 60_000),
  known: new KnownAddresses(30 * 24 * 3600_000, 10_000),
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
  const account = accountKey(email)
  const here = `${account}|${ip}`
  const record = (event: string) => deps.log(securityLine(event, { account, ip }))

  // An address the account has used before has its own budget; any other
  // address shares the account's. The owner signing in from a new address
  // while someone is guessing at the account still waits out the window.
  const accountBudget = deps.known.has(here) ? deps.byKnown : deps.byAccount
  const accountBucket = accountBudget === deps.byKnown ? here : account
  if (!deps.byIp.take(ip) || !accountBudget.take(accountBucket)) {
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
  // Only the budget this attempt drew on: signing in from home does not hand
  // whoever is guessing elsewhere a fresh 20.
  accountBudget.clear(accountBucket)
  deps.known.add(here)
  await deps.setSession(g.session)
  record('login.ok')
  return ok({ next: '/bob/performance' })
}
