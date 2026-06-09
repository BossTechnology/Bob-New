// Shared utility helpers used across services (Backend Discovery §4).
import type { SentimentReading, Window } from './types'

type SentKey = 'angry' | 'unsatisfied' | 'satisfied' | 'content' | 'happy'
const SENT_KEYS: SentKey[] = ['angry', 'unsatisfied', 'satisfied', 'content', 'happy']

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return (arr || []).reduce((acc, item) => {
    const k = key(item)
    ;(acc[k] = acc[k] || []).push(item)
    return acc
  }, {} as Record<string, T[]>)
}

// Window → lower-bound Date for "since" filters.
export function windowToDate(window: Window): Date {
  const now = Date.now()
  const map: Record<Window, number> = {
    live: 5 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '24h': 24 * 60 * 60 * 1000,
    '7d': 7 * 24 * 60 * 60 * 1000,
    '30d': 30 * 24 * 60 * 60 * 1000,
  }
  return new Date(now - (map[window] ?? map.live))
}

// Maps a dashboard metric id to the interaction.type it aggregates over.
export function metricToType(metric: string): string {
  const map: Record<string, string> = {
    res: 'resolved',
    aba: 'abandoned',
    des: 'disambiguation',
    der: 'escalation',
    alu: 'hallucination',
  }
  return map[metric] ?? metric
}

// Force a 3-way actor split to sum to exactly 100.
export function adjust100(p: { customer: number; ai: number; human: number }) {
  const drift = p.customer + p.ai + p.human - 100
  return { ...p, ai: p.ai - drift }
}

// Force the 5 sentiment values to sum to exactly 100.
export function adjustSentiment100(s: SentimentReading): SentimentReading {
  const sum = SENT_KEYS.reduce((a, k) => a + (Number(s[k]) || 0), 0)
  if (sum === 0) return { angry: 0, unsatisfied: 0, satisfied: 100, content: 0, happy: 0 }
  const scaled = { ...s }
  SENT_KEYS.forEach((k) => { scaled[k] = Math.round((Number(s[k]) || 0) * 100 / sum) })
  const drift = SENT_KEYS.reduce((a, k) => a + scaled[k], 0) - 100
  scaled.satisfied -= drift
  return scaled
}

// Volume-weighted average of channel sentiment readings.
export function weightedSentimentAverage(readings: SentimentReading[]): SentimentReading {
  const totalWeight = readings.reduce((a, r) => a + (r.sample_size || 1), 0) || 1
  const out: SentimentReading = { angry: 0, unsatisfied: 0, satisfied: 0, content: 0, happy: 0, sample_size: totalWeight }
  for (const r of readings) {
    const w = (r.sample_size || 1) / totalWeight
    SENT_KEYS.forEach((k) => { out[k] += (Number(r[k]) || 0) * w })
  }
  SENT_KEYS.forEach((k) => { out[k] = Math.round(out[k]) })
  return out
}
