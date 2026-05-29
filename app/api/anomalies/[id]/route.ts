import { NextRequest } from 'next/server'
import { getSupabase } from '@/lib/supabase'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  let body: { status?: string }
  try { body = await request.json() } catch { return Response.json({ error: 'Invalid JSON' }, { status: 400 }) }

  const validStatus = ['active', 'open', 'investigating', 'escalated', 'resolved']
  if (!body.status || !validStatus.includes(body.status)) {
    return Response.json({ error: 'Invalid status' }, { status: 400 })
  }

  const sb = getSupabase()
  const update: Record<string, unknown> = { status: body.status }
  if (body.status === 'resolved') update.resolved_at = new Date().toISOString()

  const { data, error } = await sb.from('anomalies').update(update).eq('id', id).select().single()
  if (error) return Response.json({ error: error.message }, { status: 500 })
  return Response.json(data)
}
