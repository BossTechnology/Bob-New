// §5.10 POST /api/admin/seed — seed realistic demo data for an org (internal only).
// Supports the §12.2 Demo Mode path: a demo org with seeded channels,
// interactions, sentiment, alerts and anomalies so the dashboard shows live data.
import { NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { requireService } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

const CHANNELS = ['bot', 'whatsapp', 'voice', 'app', 'forms']
const TYPES = ['resolved', 'abandoned', 'disambiguation', 'escalation', 'hallucination']
const ACTORS = ['customer', 'ai', 'human']
const SENTI = ['angry', 'unsatisfied', 'satisfied', 'content', 'happy']
const rnd = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)]

export async function POST(request: NextRequest) {
  try {
    requireService(request)
    const body = await request.json().catch(() => ({}))
    const sb = getServiceClient()

    // Resolve / create the demo org.
    let orgId: string = body?.org_id
    if (!orgId) {
      const slug = body?.slug || 'demo'
      const { data: existing } = await sb.from('organizations').select('id').eq('slug', slug).maybeSingle()
      if (existing) orgId = existing.id
      else {
        const { data, error } = await sb.from('organizations')
          .insert({ name: 'BOb Demo', slug, industry: body?.industry || 'education', plan: 'enterprise', settings: { features: { bobee_voice: true, pdf_reports: true, anomaly_detection: true, pattern_recognition: true, rca_claude: true } } })
          .select('id').single()
        if (error) throw error
        orgId = data.id
      }
    }

    // Channels.
    await sb.from('channels').upsert(
      CHANNELS.map((c, i) => ({ org_id: orgId, channel_type: c, display_name: c, active: true, display_order: i })),
      { onConflict: 'org_id,channel_type', ignoreDuplicates: true },
    )

    // Interactions over the last 24h (so MetricAggregationService has data).
    const now = Date.now()
    const interactions = Array.from({ length: 600 }, () => ({
      org_id: orgId, channel_id: rnd(CHANNELS), type: rnd(TYPES), actor: rnd(ACTORS),
      sentiment: rnd(SENTI), duration_ms: 1000 + Math.floor(Math.random() * 600000),
      occurred_at: new Date(now - Math.floor(Math.random() * 24 * 3600 * 1000)).toISOString(),
    }))
    await sb.from('interactions').insert(interactions)

    // Sentiment reading (sums to 100).
    await sb.from('sentiment_readings').insert({ org_id: orgId, channel_id: 'all', angry: 8, unsatisfied: 14, satisfied: 40, content: 26, happy: 12, sample_size: 600 })

    // Seed alerts + anomalies (mirrors the simulation seed data).
    await sb.from('alerts').insert([
      { org_id: orgId, metric_id: 'aba', metric_name: 'Abandonados', breach_type: 'upper', value: 43, threshold: 40, sev: 'critical' },
      { org_id: orgId, metric_id: 'alu', metric_name: 'Alucinaciones', breach_type: 'upper', value: 23, threshold: 20, sev: 'warning' },
      { org_id: orgId, metric_id: 'avgtime', metric_name: 'Tiempo Prom.', breach_type: 'upper', value: 18, threshold: 15, sev: 'warning' },
    ])
    await sb.from('anomalies').insert([
      { org_id: orgId, type: 'anomaly', sev: 'critical', metric: 'aba', title: 'Abandonment rate spike', desc: 'Abandonment exceeds predicted bound by 3.1σ. WhatsApp most affected.', status: 'active' },
      { org_id: orgId, type: 'incident', sev: 'critical', metric: 'alu', title: 'Hallucination rate critical', desc: 'AI hallucination crossed critical threshold on WhatsApp.', status: 'open' },
      { org_id: orgId, type: 'issue', sev: 'warning', metric: 'avgtime', title: 'Peak-hour response degradation', desc: 'Response time incidents correlated with peak load 09:00–11:00.', status: 'open' },
    ])

    return ok({ org_id: orgId, seeded: { interactions: interactions.length, channels: CHANNELS.length } })
  } catch (e) {
    return handle(e)
  }
}
