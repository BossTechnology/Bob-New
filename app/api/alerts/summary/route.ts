import { getSupabase } from '@/lib/supabase'

export async function GET() {
  const sb = getSupabase()
  const { data, error } = await sb.from('alerts').select('sev')
  if (error) return Response.json({ error: error.message }, { status: 500 })
  const rows = data ?? []
  return Response.json({
    critical: rows.filter(r => r.sev === 'critical').length,
    warning: rows.filter(r => r.sev === 'warning').length,
    total: rows.length,
  })
}
