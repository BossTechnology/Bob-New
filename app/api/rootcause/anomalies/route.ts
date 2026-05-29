import { getSupabase } from '@/lib/supabase'
import { getRuleBasedRootCause } from '@/lib/rootcause'

export async function GET() {
  const sb = getSupabase()

  // Try cached (last hour)
  const since = new Date(Date.now() - 3600_000).toISOString()
  const { data: cached } = await sb
    .from('rootcause_log')
    .select('*')
    .eq('context', 'anomalies')
    .gte('generated_at', since)
    .order('generated_at', { ascending: false })
    .limit(1)
    .single()

  if (cached) return Response.json(cached)

  const { data: anomalies, error } = await sb
    .from('anomalies')
    .select('metric,sev,type')
    .neq('status', 'resolved')

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const rc = getRuleBasedRootCause(anomalies ?? [])

  await sb.from('rootcause_log').insert({
    context: 'anomalies', ...rc, generated_at: new Date().toISOString(),
  })

  return Response.json(rc)
}
