// Backend Discovery §4.4 — sigma-based anomaly detection against rolling baselines.
import { getServiceClient } from '@/lib/supabase'
import { callClaude, MODELS, parseClaudeJson } from '@/lib/claude'
import { metricToType } from '@/lib/utils'
import type { MetricSnapshot, BobAnomaly } from '@/lib/types'

type Baseline = { mean: number; stddev: number; sample_size: number }

export class AnomalyDetectionService {
  private async getBaseline(snapshot: MetricSnapshot): Promise<Baseline | null> {
    const sb = getServiceClient()
    const now = new Date()
    const { data } = await sb.from('baselines')
      .select('mean, stddev, sample_size')
      .eq('org_id', snapshot.org_id).eq('metric', snapshot.metric).eq('channel_id', snapshot.channel_id)
      .eq('day_of_week', now.getUTCDay()).eq('hour_of_day', now.getUTCHours())
      .maybeSingle()
    return (data as Baseline) || null
  }

  private async getActiveAnomaly(orgId: string, metric: string, channelId: string | null): Promise<BobAnomaly | null> {
    const sb = getServiceClient()
    let q = sb.from('anomalies').select('*')
      .eq('org_id', orgId).eq('metric', metric).neq('status', 'resolved')
    if (channelId) q = q.eq('channel_id', channelId)
    const { data } = await q.order('occurred_at', { ascending: false }).limit(1).maybeSingle()
    return (data as BobAnomaly) || null
  }

  async evaluate(snapshot: MetricSnapshot): Promise<void> {
    const baseline = await this.getBaseline(snapshot)
    if (!baseline || baseline.sample_size < 50 || baseline.stddev === 0) return

    const sigma = (snapshot.total - baseline.mean) / baseline.stddev
    if (Math.abs(sigma) < 2.0) return
    const sev = Math.abs(sigma) >= 3.5 ? 'critical' : Math.abs(sigma) >= 2.5 ? 'warning' : 'info'

    const sb = getServiceClient()
    const existing = await this.getActiveAnomaly(snapshot.org_id, snapshot.metric, snapshot.channel_id)
    if (existing) {
      await sb.from('anomalies').update({ sigma, actual: snapshot.total, sev }).eq('id', existing.id)
      await this.checkPromotion(existing.id, sigma)
      return
    }

    const { title, desc } = await this.generateDescription(snapshot, sigma, baseline)
    await sb.from('anomalies').insert({
      org_id: snapshot.org_id, type: 'anomaly', sev, metric: snapshot.metric,
      channel_id: snapshot.channel_id, sigma, baseline: baseline.mean, actual: snapshot.total,
      title, desc,
    })
  }

  private async checkPromotion(anomalyId: string, sigma: number): Promise<void> {
    if (Math.abs(sigma) >= 3.5) {
      const sb = getServiceClient()
      await sb.from('anomalies').update({ type: 'incident' }).eq('id', anomalyId).eq('type', 'anomaly')
    }
  }

  private async generateDescription(snapshot: MetricSnapshot, sigma: number, baseline: Baseline) {
    const raw = await callClaude({
      model: MODELS.haiku,
      maxTokens: 120,
      system: 'You write concise observability anomaly descriptions. Respond ONLY with JSON {"title":string(<=60 chars),"desc":string(<=200 chars)}.',
      messages: [{
        role: 'user',
        content: `Metric ${snapshot.metric} on channel ${snapshot.channel_id} is ${sigma.toFixed(1)}σ from baseline (mean ${baseline.mean}, actual ${snapshot.total}).`,
      }],
    })
    return parseClaudeJson(raw, {
      title: `${snapshot.metric} deviation ${sigma.toFixed(1)}σ`,
      desc: `Observed ${snapshot.total} vs baseline ${baseline.mean} on ${snapshot.channel_id}.`,
    })
  }

  // Runs hourly via cron — computes mean+stddev per metric+channel+DOW+HOD over 14 days.
  async computeBaselines(orgId: string): Promise<void> {
    const sb = getServiceClient()
    const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString()
    const metrics = ['res', 'aba', 'des', 'der', 'alu']

    for (const metric of metrics) {
      const { data } = await sb.from('interactions')
        .select('channel_id, occurred_at')
        .eq('org_id', orgId).eq('type', metricToType(metric)).gte('occurred_at', since)
      if (!data?.length) continue

      // Bucket counts per channel+DOW+HOD per calendar hour, then mean/stddev across buckets.
      const perBucket = new Map<string, Map<string, number>>()
      for (const row of data as { channel_id: string; occurred_at: string }[]) {
        const d = new Date(row.occurred_at)
        const key = `${row.channel_id}|${d.getUTCDay()}|${d.getUTCHours()}`
        const hourKey = d.toISOString().slice(0, 13)
        const inner = perBucket.get(key) || new Map<string, number>()
        inner.set(hourKey, (inner.get(hourKey) || 0) + 1)
        perBucket.set(key, inner)
      }

      const rows = [...perBucket.entries()].map(([key, hours]) => {
        const [channel_id, dow, hod] = key.split('|')
        const counts = [...hours.values()]
        const n = counts.length
        const mean = counts.reduce((a, b) => a + b, 0) / n
        const variance = counts.reduce((a, b) => a + (b - mean) ** 2, 0) / n
        return {
          org_id: orgId, metric, channel_id,
          day_of_week: Number(dow), hour_of_day: Number(hod),
          mean, stddev: Math.sqrt(variance), sample_size: n,
        }
      })
      if (rows.length) {
        await sb.from('baselines').upsert(rows, { onConflict: 'org_id,metric,channel_id,day_of_week,hour_of_day' })
      }
    }
  }
}
