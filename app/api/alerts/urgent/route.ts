import { getSupabase } from '@/lib/supabase'

export async function GET() {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('alerts')
    .select('*')
    .eq('sev', 'critical')
    .order('occurred_at', { ascending: false })
    .limit(5)

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}
