import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const metric = searchParams.get('metric')
  const sev = searchParams.get('sev')
  const limit = Math.min(Number(searchParams.get('limit') || '50'), 200)

  const sb = getSupabase()
  let q = sb.from('alerts').select('*').order('occurred_at', { ascending: false }).limit(limit)
  if (metric) q = q.eq('metric_id', metric)
  if (sev) q = q.eq('sev', sev)

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}

export async function POST(request: NextRequest) {
  let body: Record<string, unknown>
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const sb = getSupabase()
  const { data, error } = await sb
    .from('alerts')
    .insert({ ...body, occurred_at: new Date().toISOString() })
    .select()
    .single()

  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data, { status: 201 })
}
