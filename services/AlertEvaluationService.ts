// Backend Discovery §4.3 — evaluates snapshots against thresholds, fires alerts
// with deduplication, suppression and auto-resolve.
import { getServiceClient } from '@/lib/supabase'
import type { MetricSnapshot, NotificationRule, BobAlert } from '@/lib/types'
import { NotificationService } from './NotificationService'

const notificationRouter = new NotificationService()

export class AlertEvaluationService {
  async evaluate(snapshot: MetricSnapshot): Promise<void> {
    const sb = getServiceClient()
    const { data: rules } = await sb.from('notification_rules')
      .select('*')
      .eq('org_id', snapshot.org_id)
      .eq('metric_id', snapshot.metric)
      .eq('active', true)
      .in('channel_id', ['all', snapshot.channel_id])
    for (const rule of (rules as NotificationRule[]) || []) {
      await this.evaluateRule(snapshot, rule)
    }
  }

  private getValueForActor(snapshot: MetricSnapshot, actor: string): number {
    if (actor === 'customer') return snapshot.pct_customer
    if (actor === 'ai') return snapshot.pct_ai
    if (actor === 'human') return snapshot.pct_human
    return snapshot.total
  }

  private async getActiveAlert(ruleId: string, orgId: string): Promise<BobAlert | null> {
    const sb = getServiceClient()
    const { data } = await sb.from('alerts')
      .select('*').eq('org_id', orgId).eq('rule_id', ruleId).eq('status', 'active')
      .order('occurred_at', { ascending: false }).limit(1).maybeSingle()
    return (data as BobAlert) || null
  }

  private async evaluateRule(snapshot: MetricSnapshot, rule: NotificationRule): Promise<void> {
    const value = this.getValueForActor(snapshot, rule.actor)
    const upperBreach = rule.upper_threshold !== null && value > rule.upper_threshold
    const lowerBreach = rule.lower_threshold !== null && value < rule.lower_threshold

    if (!upperBreach && !lowerBreach) {
      await this.checkAutoResolve(snapshot, rule)
      return
    }

    const existing = await this.getActiveAlert(rule.id, snapshot.org_id)
    if (existing) {
      const sb = getServiceClient()
      await sb.from('alerts').update({ value }).eq('id', existing.id)
      return // suppression window — do not re-notify
    }

    const threshold = (upperBreach ? rule.upper_threshold : rule.lower_threshold)!
    const excess = Math.abs((value - threshold) / threshold) * 100
    const sev = excess > 25 ? 'critical' : 'warning'
    const alert = await this.createAlert({
      snapshot, rule, value, threshold,
      breach_type: upperBreach ? 'upper' : 'lower', excess_pct: excess, sev,
    })
    if (alert) await notificationRouter.route(alert, rule)
  }

  private async createAlert(p: {
    snapshot: MetricSnapshot; rule: NotificationRule; value: number; threshold: number
    breach_type: 'upper' | 'lower'; excess_pct: number; sev: 'critical' | 'warning'
  }): Promise<BobAlert | null> {
    const sb = getServiceClient()
    const { data } = await sb.from('alerts').insert({
      org_id: p.snapshot.org_id, rule_id: p.rule.id,
      metric_id: p.snapshot.metric, metric_name: p.snapshot.metric,
      channel_id: p.snapshot.channel_id, actor: p.rule.actor,
      breach_type: p.breach_type, value: p.value, threshold: p.threshold,
      excess_pct: p.excess_pct, sev: p.sev, status: 'active',
    }).select().single()
    return (data as BobAlert) || null
  }

  private async checkAutoResolve(snapshot: MetricSnapshot, rule: NotificationRule): Promise<void> {
    const alert = await this.getActiveAlert(rule.id, snapshot.org_id)
    if (!alert) return
    const since = new Date(Date.now() - 5 * 60 * 1000).toISOString()
    if (new Date(alert.occurred_at) < new Date(since)) {
      const sb = getServiceClient()
      await sb.from('alerts').update({ status: 'resolved', resolved_at: new Date().toISOString() }).eq('id', alert.id)
    }
  }
}
