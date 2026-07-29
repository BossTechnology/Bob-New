// BOb v3 · GET  /api/config/channels — all notification channels for the org.
//          POST /api/config/channels — create a channel.
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, created, badReq, handle } from '@/lib/api-response'

const TYPES = ['email', 'sms', 'call', 'slack', 'webhook']

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('notification_channels')
      .select('id, type, label, values')
      .eq('org_id', org_id)
      .order('created_at', { ascending: true })
    if (error) throw error
    return ok({ channels: data ?? [] })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const body = await request.json().catch(() => null)
    if (!body || !TYPES.includes(body.type) || !body.label) return badReq('Invalid channel')
    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('notification_channels')
      .insert({ org_id, type: body.type, label: body.label, values: body.values ?? [] })
      .select('id, type, label, values')
      .single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
