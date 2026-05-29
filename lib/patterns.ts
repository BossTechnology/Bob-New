type Anomaly = {
  id: string
  type: string
  sev: string
  metric: string
  title: string
  occurred_at: string
  channel_id?: string | null
}

type Pattern = {
  type: 'time-based' | 'causal-chain' | 'co-occurrence' | 'frequency'
  title: string
  detail: string
  confidence: number
  occurrences: number
  metrics: string[]
  channels: string[]
}

function groupBy<T>(arr: T[], key: (item: T) => string): Record<string, T[]> {
  return arr.reduce((acc, item) => {
    const k = key(item)
    acc[k] = acc[k] || []
    acc[k].push(item)
    return acc
  }, {} as Record<string, T[]>)
}

export function detectTimeBasedPatterns(events: Anomaly[]): Pattern[] {
  const patterns: Pattern[] = []
  const groups = groupBy(events, e => `${e.metric}:${e.type}`)

  for (const group of Object.values(groups)) {
    if (group.length < 2) continue
    const hours = group.map(e => new Date(e.occurred_at).getHours())
    const hourCounts: Record<number, number> = {}
    hours.forEach(h => { hourCounts[h] = (hourCounts[h] || 0) + 1 })
    const dominantHour = Number(Object.entries(hourCounts).sort((a, b) => b[1] - a[1])[0][0])
    const concentration = hourCounts[dominantHour] / group.length

    if (concentration >= 0.6) {
      patterns.push({
        type: 'time-based',
        title: `${group[0].title} — recurring pattern`,
        detail: `Detected ${group.length}x, consistently around ${dominantHour}:00. ${Math.round(concentration * 100)}% concentration.`,
        confidence: Math.round(concentration * 100),
        occurrences: group.length,
        metrics: [group[0].metric],
        channels: [],
      })
    }
  }
  return patterns
}

export function detectCausalChains(events: Anomaly[]): Pattern[] {
  const patterns: Pattern[] = []
  const sorted = [...events].sort((a, b) =>
    new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  )

  const PAIRS: [string, string][] = [['aba', 'der'], ['alu', 'der'], ['des', 'aba'], ['avgtime', 'aba']]

  for (const [causeMetric, effectMetric] of PAIRS) {
    const causes = sorted.filter(e => e.metric === causeMetric)
    const effects = sorted.filter(e => e.metric === effectMetric)
    let matches = 0

    for (const cause of causes) {
      const causeTime = new Date(cause.occurred_at).getTime()
      const hasEffect = effects.some(e => {
        const lag = (new Date(e.occurred_at).getTime() - causeTime) / 60000
        return lag > 0 && lag <= 20
      })
      if (hasEffect) matches++
    }

    const confidence = causes.length > 0 ? matches / causes.length : 0
    if (confidence >= 0.6) {
      patterns.push({
        type: 'causal-chain',
        title: `${causeMetric.toUpperCase()} → ${effectMetric.toUpperCase()} causal chain`,
        detail: `${causeMetric} events are followed by ${effectMetric} within 20 min in ${Math.round(confidence * 100)}% of cases.`,
        confidence: Math.round(confidence * 100),
        occurrences: matches,
        metrics: [causeMetric, effectMetric],
        channels: [],
      })
    }
  }
  return patterns
}

export function detectCoOccurrence(events: Anomaly[]): Pattern[] {
  const patterns: Pattern[] = []
  const sorted = [...events].sort((a, b) =>
    new Date(a.occurred_at).getTime() - new Date(b.occurred_at).getTime()
  )

  for (let i = 0; i < sorted.length; i++) {
    const base = sorted[i]
    if (!base.channel_id) continue

    const coEvents = sorted.filter((e, j) => {
      if (j === i || e.metric !== base.metric) return false
      const lag = Math.abs(new Date(e.occurred_at).getTime() - new Date(base.occurred_at).getTime()) / 60000
      return lag <= 10 && e.channel_id !== base.channel_id
    })

    if (coEvents.length >= 1) {
      const channels = [...new Set([base.channel_id, ...coEvents.map(e => e.channel_id!)])]
      patterns.push({
        type: 'co-occurrence',
        title: `${base.metric.toUpperCase()} — multi-channel co-occurrence`,
        detail: `Same anomaly detected across ${channels.length} channels within 10 min: ${channels.join(', ')}.`,
        confidence: 80,
        occurrences: coEvents.length + 1,
        metrics: [base.metric],
        channels,
      })
    }
  }
  return patterns
}

export function detectFrequencyPatterns(events: Anomaly[]): Pattern[] {
  const counts: Record<string, number> = {}
  events.forEach(e => { counts[e.metric] = (counts[e.metric] || 0) + 1 })

  return Object.entries(counts)
    .filter(([, count]) => count >= 3)
    .map(([metric, count]) => ({
      type: 'frequency' as const,
      title: `${metric.toUpperCase()} — high frequency`,
      detail: `${count} events on ${metric} — highest frequency metric in current window.`,
      confidence: Math.min(95, 60 + count * 5),
      occurrences: count,
      metrics: [metric],
      channels: [],
    }))
}

export function computePatterns(events: Anomaly[]): Pattern[] {
  return [
    ...detectTimeBasedPatterns(events),
    ...detectCausalChains(events),
    ...detectCoOccurrence(events),
    ...detectFrequencyPatterns(events),
  ].sort((a, b) => b.confidence - a.confidence).slice(0, 5)
}
