import { getSupabase } from '@/lib/supabase'
import { detectFrequencyPatterns, detectTimeBasedPatterns } from '@/lib/patterns'

export async function GET() {
  const sb = getSupabase()

  const { data: cached } = await sb
    .from('patterns')
    .select('*')
    .eq('context', 'alerts')
    .order('last_seen', { ascending: false })
    .limit(5)

  if (cached && cached.length > 0) return Response.json(cached)

  const { data: alerts, error } = await sb
    .from('alerts')
    .select('id,metric_id,sev,occurred_at')
    .order('occurred_at', { ascending: false })
    .limit(100)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  // Adapt alerts to anomaly shape for pattern detection
  const asAnomalies = (alerts ?? []).map(a => ({
    id: a.id, type: 'anomaly', sev: a.sev, metric: a.metric_id,
    title: a.metric_id, occurred_at: a.occurred_at, channel_id: null,
  }))

  const patterns = [
    ...detectFrequencyPatterns(asAnomalies),
    ...detectTimeBasedPatterns(asAnomalies),
  ].slice(0, 5)

  if (patterns.length > 0) {
    await sb.from('patterns').insert(
      patterns.map(p => ({ ...p, context: 'alerts', first_seen: new Date().toISOString(), last_seen: new Date().toISOString() }))
    )
  }

  return Response.json(patterns)
}
