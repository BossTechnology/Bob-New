import { getSupabase } from '@/lib/supabase'
import { computePatterns } from '@/lib/patterns'

export async function GET() {
  const sb = getSupabase()

  // Try cached patterns first
  const { data: cached } = await sb
    .from('patterns')
    .select('*')
    .eq('context', 'anomalies')
    .order('last_seen', { ascending: false })
    .limit(5)

  if (cached && cached.length > 0) return Response.json(cached)

  // Compute from raw anomaly data
  const { data: anomalies, error } = await sb
    .from('anomalies')
    .select('id,type,sev,metric,title,occurred_at,channel_id')
    .order('occurred_at', { ascending: false })
    .limit(100)

  if (error) return Response.json({ error: error.message }, { status: 500 })

  const patterns = computePatterns(anomalies ?? [])

  // Cache computed patterns
  if (patterns.length > 0) {
    await sb.from('patterns').insert(
      patterns.map(p => ({ ...p, context: 'anomalies', first_seen: new Date().toISOString(), last_seen: new Date().toISOString() }))
    )
  }

  return Response.json(patterns)
}
