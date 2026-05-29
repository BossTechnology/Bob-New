import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'
import { getRuleBasedRootCause } from '@/lib/rootcause'

export async function POST(request: NextRequest) {
  let body: { anomalies?: unknown[]; alerts?: unknown[]; context?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const { anomalies = [], alerts = [], context = 'anomalies' } = body
  const apiKey = process.env.ANTHROPIC_API_KEY
  const sb = getSupabase()

  // Try AI generation first
  if (apiKey && (anomalies.length > 0 || alerts.length > 0)) {
    try {
      const upstream = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 600,
          system: `You are BOb's root cause analysis engine. Given anomaly and alert data from a business interaction platform, identify the most probable root cause. Respond ONLY with valid JSON matching this schema exactly: {"summary":string,"chain":string[],"primary_trigger":string,"confidence":number}. The chain is an ordered array of 3-5 causal steps. Be concise and actionable.`,
          messages: [{ role: 'user', content: `Analyze these signals:\n${JSON.stringify({ anomalies, alerts }, null, 2)}` }],
        }),
      })

      if (upstream.ok) {
        const aiData = await upstream.json()
        const raw = aiData.content?.[0]?.text || '{}'
        const rc = JSON.parse(raw.replace(/```json|```/g, '').trim())

        await sb.from('rootcause_log').insert({ context, ...rc, generated_at: new Date().toISOString() })
        return Response.json(rc)
      }
    } catch { /* fall through to rule-based */ }
  }

  // Rule-based fallback
  const rc = getRuleBasedRootCause(
    (anomalies as { metric: string; sev: string; type: string }[]),
    (alerts as { metric_id: string; sev: string }[])
  )
  await sb.from('rootcause_log').insert({ context, ...rc, generated_at: new Date().toISOString() })
  return Response.json(rc)
}
