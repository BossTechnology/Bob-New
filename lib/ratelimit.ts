// Rate limiting — Backend Discovery §3.5.
// NOTE: in-memory sliding window. This is best-effort and per-instance only;
// on Vercel's serverless/fluid runtime each instance keeps its own counters.
// For durable global limits, back this with Upstash Redis or Vercel KV (see
// the manual setup checklist). The limits below mirror the §3.5 table.
import { ApiError } from './api-response'

const buckets = new Map<string, number[]>()

export function rateLimit(key: string, limit: number, windowMs = 60_000): boolean {
  const now = Date.now()
  const hits = (buckets.get(key) || []).filter((t) => now - t < windowMs)
  if (hits.length >= limit) {
    buckets.set(key, hits)
    return false
  }
  hits.push(now)
  buckets.set(key, hits)
  return true
}

export const LIMITS = {
  general: 100,   // 100 req/min/org
  ai: 10,         // 10 req/min/user (Claude cost control)
  notify: 20,     // 20 req/min/org
  auth: 10,       // 10 req/min/IP
  reports: 5,     // 5 req/min/org
} as const

// Throws ApiError(429) when the limit is exceeded.
export function enforceRateLimit(key: string, limit: number, windowMs = 60_000): void {
  if (!rateLimit(key, limit, windowMs)) throw new ApiError(429, 'Rate limit exceeded')
}
