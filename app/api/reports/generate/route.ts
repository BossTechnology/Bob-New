// §5.9 POST /api/reports/generate — assembles a timeframe report (analyst+).
// NOTE: §8.2 specifies a private 'reports' Storage bucket with 24h signed URLs
// and server-side PDF rendering. This assembles the report dataset and, when the
// bucket exists, uploads a JSON artifact and returns a signed URL. PDF rendering
// stays client-side (jsPDF) in the dashboard until a server renderer is added
// (see SETUP.md → "Server-side PDF").
import { NextRequest } from 'next/server'
import { getRouteClient, getServiceClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { enforceRateLimit, LIMITS } from '@/lib/ratelimit'
import { ok, handle } from '@/lib/api-response'

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    enforceRateLimit(`reports:${org_id}`, LIMITS.reports)
    const body = await request.json().catch(() => ({}))
    const timeframe = body?.timeframe || '30d'

    const sb = await getRouteClient()
    const [metrics, alerts, anomalies, sentiment] = await Promise.all([
      sb.from('metric_snapshots').select('*').eq('org_id', org_id).eq('window', timeframe).eq('channel_id', 'all'),
      sb.from('alerts').select('sev,metric_name,value,threshold,occurred_at').eq('org_id', org_id).order('occurred_at', { ascending: false }).limit(50),
      sb.from('anomalies').select('type,sev,metric,title,status').eq('org_id', org_id).neq('status', 'resolved'),
      sb.from('sentiment_readings').select('*').eq('org_id', org_id).eq('channel_id', 'all').order('computed_at', { ascending: false }).limit(1).maybeSingle(),
    ])

    const report = {
      org_id, timeframe, generated_at: new Date().toISOString(),
      metrics: metrics.data ?? [], alerts: alerts.data ?? [],
      anomalies: anomalies.data ?? [], sentiment: sentiment.data ?? null,
    }

    // Best-effort upload to the private 'reports' bucket → 24h signed URL.
    try {
      const svc = getServiceClient()
      const path = `${org_id}/bob-report-${timeframe}-${Date.now()}.json`
      const up = await svc.storage.from('reports').upload(path, JSON.stringify(report, null, 2), {
        contentType: 'application/json', upsert: true,
      })
      if (!up.error) {
        const signed = await svc.storage.from('reports').createSignedUrl(path, 60 * 60 * 24)
        if (signed.data?.signedUrl) {
          return ok({ report_url: signed.data.signedUrl, expires_at: new Date(Date.now() + 86400000).toISOString() })
        }
      }
    } catch {
      /* bucket not provisioned — fall back to inline data */
    }
    return ok({ report, report_url: null })
  } catch (e) {
    return handle(e)
  }
}
