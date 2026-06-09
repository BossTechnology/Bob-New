// §7.1 GET /api/cron/issue-grouping — group related active anomalies into issues.
import { requireCron } from '@/lib/auth'
import { activeOrgIds } from '@/lib/cron'
import { getServiceClient } from '@/lib/supabase'
import { groupBy } from '@/lib/utils'
import { handle } from '@/lib/api-response'

export async function GET(request: Request) {
  const start = Date.now()
  let grouped = 0
  try {
    requireCron(request)
    const sb = getServiceClient()
    const orgs = await activeOrgIds()

    for (const org of orgs) {
      const { data } = await sb.from('anomalies').select('id, metric, type, sev')
        .eq('org_id', org).in('type', ['anomaly', 'incident']).neq('status', 'resolved')
      const byMetric = groupBy((data as { id: string; metric: string; type: string; sev: string }[]) || [], (a) => a.metric)
      for (const [metric, rows] of Object.entries(byMetric)) {
        if (rows.length < 2) continue
        const related = rows.map((r) => r.id)
        const sev = rows.some((r) => r.sev === 'critical') ? 'critical' : 'warning'
        await sb.from('anomalies').insert({
          org_id: org, type: 'issue', sev, metric,
          title: `Grouped ${metric} pattern (${rows.length})`,
          desc: `${rows.length} related ${metric} signals grouped into one issue.`,
          status: 'open', related_ids: related,
        })
        grouped++
      }
    }
    return Response.json({ ok: true, grouped, duration_ms: Date.now() - start })
  } catch (e) {
    return handle(e)
  }
}
