import { getSupabase } from '@/lib/supabase'

export async function GET() {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('anomalies')
    .select('*')
    .neq('status', 'resolved')
    .order('sev', { ascending: true }) // critical first alphabetically
    .order('occurred_at', { ascending: false })
    .limit(5)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}
