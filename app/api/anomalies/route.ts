import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const type = searchParams.get('type')
  const metric = searchParams.get('metric')
  const status = searchParams.get('status')
  const limit = Math.min(Number(searchParams.get('limit') || '50'), 200)

  const sb = getSupabase()
  let q = sb.from('anomalies').select('*').order('occurred_at', { ascending: false }).limit(limit)

  if (type) q = q.eq('type', type)
  if (metric) q = q.eq('metric', metric)
  if (status) q = q.eq('status', status)

  const { data, error } = await q
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data ?? [])
}
