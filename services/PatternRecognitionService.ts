// Backend Discovery Appendix A / §7.1 — pattern recognition over anomaly & alert
// history. Persists only the three types allowed by the patterns CHECK
// constraint (§2.5): time-based, causal-chain, co-occurrence.
import { getServiceClient } from '@/lib/supabase'
import { detectTimeBasedPatterns, detectCausalChains, detectCoOccurrence } from '@/lib/patterns'

type Context = 'anomalies' | 'alerts'

type Event = {
  id: string; type: string; sev: string; metric: string
  title: string; occurred_at: string; channel_id?: string | null
}

export class PatternRecognitionService {
  private async loadEvents(orgId: string, context: Context): Promise<Event[]> {
    const sb = getServiceClient()
    if (context === 'anomalies') {
      const { data } = await sb.from('anomalies')
        .select('id, type, sev, metric, title, occurred_at, channel_id')
        .eq('org_id', orgId).order('occurred_at', { ascending: false }).limit(200)
      return (data as Event[]) || []
    }
    const { data } = await sb.from('alerts')
      .select('id, metric_id, metric_name, sev, channel_id, occurred_at')
      .eq('org_id', orgId).order('occurred_at', { ascending: false }).limit(200)
    return ((data as { id: string; metric_id: string; metric_name: string; sev: string; channel_id: string | null; occurred_at: string }[]) || [])
      .map((a) => ({ id: a.id, type: 'alert', sev: a.sev, metric: a.metric_id, title: a.metric_name, occurred_at: a.occurred_at, channel_id: a.channel_id }))
  }

  async compute(orgId: string, context: Context) {
    const events = await this.loadEvents(orgId, context)
    const patterns = [
      ...detectTimeBasedPatterns(events),
      ...detectCausalChains(events),
      ...detectCoOccurrence(events),
    ]
    const sb = getServiceClient()
    if (patterns.length) {
      await sb.from('patterns').insert(patterns.map((p) => ({
        org_id: orgId, context, type: p.type, title: p.title, detail: p.detail,
        confidence: Math.round(p.confidence), occurrences: p.occurrences,
        metrics: p.metrics, channels: p.channels,
      })))
    }
    return patterns
  }

  async list(orgId: string, context: Context) {
    const sb = getServiceClient()
    const { data } = await sb.from('patterns')
      .select('*').eq('org_id', orgId).eq('context', context)
      .order('last_seen', { ascending: false }).limit(20)
    return data || []
  }
}
