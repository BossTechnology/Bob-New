import { getSupabase } from '@/lib/supabase'

export async function GET() {
  const sb = getSupabase()
  const { data, error } = await sb.from('anomalies').select('type, status')

  if (error) return Response.json({ error: error.message }, { status: 500 })
  const rows = data ?? []

  return Response.json({
    anomalies: rows.filter(r => r.type === 'anomaly').length,
    incidents: rows.filter(r => r.type === 'incident').length,
    issues: rows.filter(r => r.type === 'issue').length,
    resolved: rows.filter(r => r.status === 'resolved').length,
    total: rows.length,
  })
}
