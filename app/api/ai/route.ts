// Public Claude proxy used by the demo dashboard (public/dashboard.html).
// This endpoint is intentionally unauthenticated, so it is hardened instead:
// model allowlist, max_tokens cap, body-shape validation, and a per-IP
// rate limit. Authenticated AI features live under /api/ai/* (insights,
// chat, rootcause, sentiment) and go through lib/claude.ts with requireAuth.
import { NextRequest } from 'next/server'
import { MODELS } from '@/lib/claude'

const ANTHROPIC_API = 'https://api.anthropic.com/v1/messages'

// Only the models the demo actually uses. Keeps the endpoint from being an
// open relay for arbitrary/expensive models.
const ALLOWED_MODELS = new Set<string>(Object.values(MODELS))

const MAX_TOKENS_CAP = 2048
const MAX_MESSAGES = 40
const MAX_BODY_CHARS = 60_000

// Best-effort per-IP limiter. In-memory, so it is per serverless instance —
// not a hard guarantee, but it bounds abuse together with the caps above.
// For a hard limit, put Upstash Ratelimit here (same setup as Chass1s).
const WINDOW_MS = 60_000
const MAX_REQUESTS_PER_WINDOW = 20
const hits = new Map<string, { count: number; windowStart: number }>()

function rateLimited(ip: string): boolean {
  const now = Date.now()
  const entry = hits.get(ip)
  if (!entry || now - entry.windowStart > WINDOW_MS) {
    hits.set(ip, { count: 1, windowStart: now })
    return false
  }
  entry.count += 1
  if (hits.size > 10_000) hits.clear() // memory guard
  return entry.count > MAX_REQUESTS_PER_WINDOW
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return Response.json({ error: 'API key not configured' }, { status: 500 })
  }

  const ip =
    request.headers.get('x-real-ip') ??
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ??
    'unknown'
  if (rateLimited(ip)) {
    return Response.json(
      { error: 'Too many requests. Try again in a minute.' },
      { status: 429, headers: { 'Retry-After': '60' } },
    )
  }

  const raw = await request.text()
  if (raw.length > MAX_BODY_CHARS) {
    return Response.json({ error: 'Request body too large' }, { status: 413 })
  }

  let body: Record<string, unknown>
  try {
    body = JSON.parse(raw)
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const model = typeof body.model === 'string' ? body.model : ''
  if (!ALLOWED_MODELS.has(model)) {
    return Response.json({ error: `Model not allowed: ${model}` }, { status: 400 })
  }
  if (!Array.isArray(body.messages) || body.messages.length === 0) {
    return Response.json({ error: 'messages array is required' }, { status: 400 })
  }
  if (body.messages.length > MAX_MESSAGES) {
    return Response.json({ error: 'Too many messages' }, { status: 400 })
  }

  // Forward only the fields the demo needs — never tools/mcp_servers/etc.
  const maxTokens = typeof body.max_tokens === 'number' ? body.max_tokens : MAX_TOKENS_CAP
  const forward: Record<string, unknown> = {
    model,
    max_tokens: Math.min(maxTokens, MAX_TOKENS_CAP),
    messages: body.messages,
  }
  if (typeof body.system === 'string') forward.system = body.system
  if (typeof body.temperature === 'number') forward.temperature = body.temperature

  const upstream = await fetch(ANTHROPIC_API, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify(forward),
  })

  const data = await upstream.json()

  if (!upstream.ok) {
    return Response.json(data, { status: upstream.status })
  }

  return Response.json(data)
}
