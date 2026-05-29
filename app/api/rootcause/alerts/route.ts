import { getSupabase } from '@/lib/supabase'
import { getRuleBasedRootCause } from '@/lib/rootcause'

export async function GET() {
  const sb = getSupabase()

  const since = new Date(Date.now() - 3600_000).toISOString()
  const { data: cached } = await sb
    .from('rootcause_log')
    .select('*')
    .eq('context', 'alerts')
    .gte('generated_at', since)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  if (cached) return Response.json(cached)

  const { data: alerts, error } = await sb
    .from('alerts')
    .select('metric_id,sev')
    .order('occurred_at', { ascending: false })
    .limit(50)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const asAnomalies = (alerts ?? []).map(a => ({ metric: a.metric_id, sev: a.sev, type: 'anomaly' }))
  const rc = getRuleBasedRootCause([], asAnomalies.map(a => ({ metric_id: a.metric, sev: a.sev })))

  await sb.from('rootcause_log').insert({
    context: 'alerts', ...rc, generated_at: new Date().toISOString(),
  })

  return Response.json(rc)
}
