// Shared cron helpers (§7).
import { getServiceClient } from './supabase'
import type { MetricSnapshot } from './types'

export async function activeOrgIds(): Promise<string[]> {
  const sb = getServiceClient()
  const { data } = await sb.from('organizations').select('id').eq('active', true)
  return (data || []).map((o) => o.id as string)
}

// Latest live-window snapshots for an org (used by alert + anomaly evaluation).
export async function liveSnapshots(orgId: string): Promise<MetricSnapshot[]> {
  const sb = getServiceClient()
  const { data } = await sb.from('metric_snapshots')
    .select('*').eq('org_id', orgId).eq('window', 'live')
    .order('recorded_at', { ascending: false }).limit(200)
  // Keep the most recent per metric+channel.
  const seen = new Set<string>()
  const out: MetricSnapshot[] = []
  for (const row of (data as MetricSnapshot[]) || []) {
    const key = `${row.metric}:${row.channel_id}`
    if (seen.has(key)) continue
    seen.add(key)
    out.push(row)
  }
  return out
}
