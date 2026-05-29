type Anomaly = { metric: string; sev: string; type: string }
type Alert = { metric_id: string; sev: string }

type RootCause = {
  summary: string
  chain: string[]
  primary_trigger: string
  confidence: number
}

const CAUSAL_RULES: {
  trigger: (events: Anomaly[], alerts: Alert[]) => boolean
  analysis: Omit<RootCause, 'confidence'>
  confidence: number
}[] = [
  {
    trigger: (events) => events.some(e => e.metric === 'avgtime' && e.sev === 'critical'),
    analysis: {
      summary: 'High average response time is likely causing downstream abandonment and escalation.',
      chain: ['Response time spike', 'Customer frustration', 'Abandonment', 'Escalation'],
      primary_trigger: 'Response time degradation',
    },
    confidence: 78,
  },
  {
    trigger: (events) => events.filter(e => e.metric === 'aba').length >= 2,
    analysis: {
      summary: 'Multi-channel abandonment suggests a shared upstream service issue.',
      chain: ['Upstream latency', 'Channel timeout', 'Abandonment spike', 'Escalation surge'],
      primary_trigger: 'Shared upstream service degradation',
    },
    confidence: 75,
  },
  {
    trigger: (events) => events.some(e => e.metric === 'alu' && e.sev === 'critical'),
    analysis: {
      summary: 'AI hallucination spike indicates out-of-scope queries or knowledge gaps.',
      chain: ['Out-of-scope query volume', 'AI hallucination', 'Customer distrust', 'Escalation'],
      primary_trigger: 'AI model knowledge gap or prompt injection',
    },
    confidence: 72,
  },
  {
    trigger: (events) => events.some(e => e.metric === 'der' && e.sev === 'critical'),
    analysis: {
      summary: 'Critical escalation rate indicates systemic issue not resolvable by AI or first-line agents.',
      chain: ['Complex query volume', 'AI resolution failure', 'Human queue saturation', 'Escalation cascade'],
      primary_trigger: 'AI capability gap on current query mix',
    },
    confidence: 70,
  },
  {
    trigger: (_, alerts) => alerts.filter(a => a.sev === 'critical').length >= 2,
    analysis: {
      summary: 'Multiple concurrent critical threshold breaches indicate a systemic overload event.',
      chain: ['Peak-hour volume surge', 'Threshold cascade', 'Multi-metric breach', 'Service degradation'],
      primary_trigger: 'Capacity overload during peak period',
    },
    confidence: 74,
  },
]

export function getRuleBasedRootCause(
  events: Anomaly[],
  alerts: Alert[] = []
): RootCause {
  for (const rule of CAUSAL_RULES) {
    if (rule.trigger(events, alerts)) {
      return { ...rule.analysis, confidence: rule.confidence }
    }
  }

  return {
    summary: 'No dominant root cause pattern detected. Multiple independent signals are active simultaneously.',
    chain: ['Multiple independent triggers', 'Distributed impact', 'No single root cause'],
    primary_trigger: 'Concurrent independent anomalies',
    confidence: 45,
  }
}
