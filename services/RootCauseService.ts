// Backend Discovery Appendix A / §5.6 — rule-based root cause with Claude fallback.
import { getServiceClient } from '@/lib/supabase'
import { getRuleBasedRootCause } from '@/lib/rootcause'
import { callClaude, MODELS, parseClaudeJson } from '@/lib/claude'

type Context = 'anomalies' | 'alerts'
type RootCause = { summary: string; chain: string[]; primary_trigger: string; confidence: number }

export class RootCauseService {
  async generate(orgId: string, context: Context): Promise<RootCause & { method: string }> {
    const sb = getServiceClient()

    const { data: anomalies } = await sb.from('anomalies')
      .select('metric, sev, type').eq('org_id', orgId).neq('status', 'resolved').limit(20)
    const { data: alerts } = await sb.from('alerts')
      .select('metric_id, sev').eq('org_id', orgId).eq('status', 'active').limit(20)

    const anomalyList = (anomalies as { metric: string; sev: string; type: string }[]) || []
    const alertList = (alerts as { metric_id: string; sev: string }[]) || []

    let result: RootCause
    let method = 'rule-based'

    if (process.env.ANTHROPIC_API_KEY && (anomalyList.length || alertList.length)) {
      const raw = await callClaude({
        model: MODELS.sonnet,
        maxTokens: 600,
        system: `You are BOb's root cause analysis engine. Given anomaly and alert data, identify the most probable root cause. Respond ONLY with valid JSON: {"summary":string,"chain":string[],"primary_trigger":string,"confidence":number}. chain = 3-5 ordered causal steps.`,
        messages: [{ role: 'user', content: `Analyze:\n${JSON.stringify({ anomalies: anomalyList, alerts: alertList }, null, 2)}` }],
      }).catch(() => '')
      const parsed = raw ? parseClaudeJson<RootCause | null>(raw, null) : null
      if (parsed && parsed.summary) { result = parsed; method = 'claude' }
      else result = getRuleBasedRootCause(anomalyList, alertList)
    } else {
      result = getRuleBasedRootCause(anomalyList, alertList)
    }

    await sb.from('rootcause_log').insert({ org_id: orgId, context, ...result, method })
    return { ...result, method }
  }

  async latest(orgId: string, context: Context) {
    const sb = getServiceClient()
    const { data } = await sb.from('rootcause_log')
      .select('*').eq('org_id', orgId).eq('context', context)
      .order('generated_at', { ascending: false }).limit(1).maybeSingle()
    return data
  }
}
