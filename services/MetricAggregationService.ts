// Backend Discovery §4.1 — computes the five core metrics from raw interactions.
import { getServiceClient } from '@/lib/supabase'
import { groupBy, windowToDate, metricToType, adjust100 } from '@/lib/utils'
import type { MetricSnapshot, Window } from '@/lib/types'

const METRICS = ['res', 'aba', 'des', 'der', 'alu']
const WINDOWS: Window[] = ['live', '1h', '24h', '7d', '30d']

function zeroSnapshot(orgId: string, metric: string, channelId: string, window: Window): MetricSnapshot {
  return {
    org_id: orgId, metric, channel_id: channelId, window,
    total: 0, pct_customer: 0, pct_ai: 0, pct_human: 100,
    recorded_at: new Date().toISOString(),
  }
}

async function getActiveChannels(orgId: string): Promise<string[]> {
  const sb = getServiceClient()
  const { data } = await sb.from('channels').select('channel_type').eq('org_id', orgId).eq('active', true)
  return (data || []).map((c) => c.channel_type as string)
}

export class MetricAggregationService {
  async computeSnapshot(orgId: string, metric: string, channelId = 'all', window: Window = 'live'): Promise<MetricSnapshot> {
    const sb = getServiceClient()
    const since = windowToDate(window)
    let q = sb.from('interactions').select('type, actor')
      .eq('org_id', orgId)
      .eq('type', metricToType(metric))
      .gte('occurred_at', since.toISOString())
    if (channelId !== 'all') q = q.eq('channel_id', channelId)

    const { data } = await q
    const total = data?.length || 0
    if (total === 0) return zeroSnapshot(orgId, metric, channelId, window)

    const byActor = groupBy(data!, (r) => (r as { actor: string }).actor)
    const raw = {
      customer: Math.round((byActor.customer?.length || 0) / total * 100),
      ai: Math.round((byActor.ai?.length || 0) / total * 100),
      human: Math.round((byActor.human?.length || 0) / total * 100),
    }
    const { customer, ai, human } = adjust100(raw)
    return {
      org_id: orgId, metric, channel_id: channelId, window,
      total, pct_customer: customer, pct_ai: ai, pct_human: human,
      recorded_at: new Date().toISOString(),
    }
  }

  async refreshAllSnapshots(orgId: string): Promise<void> {
    const sb = getServiceClient()
    const channels = await getActiveChannels(orgId)
    const jobs = METRICS.flatMap((m) =>
      WINDOWS.flatMap((w) =>
        ['all', ...channels].map((c) => this.computeSnapshot(orgId, m, c, w)),
      ),
    )
    const snapshots = await Promise.all(jobs)
    await sb.from('metric_snapshots').insert(snapshots)
  }
}
