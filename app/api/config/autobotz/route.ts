// BOb v5.3 · GET  /api/config/autobotz — every AutoBotz binding for the org.
//            POST /api/config/autobotz — create a binding.
//
// A binding is a reference to something that already exists in BzzzBX or the
// customer's systems, never an automation BOb owns. Per-type inputs land in
// `config` because the four types share almost no fields (a Synthetics check
// has no payload, an AI Agent has no HTTP method).
import { NextRequest } from 'next/server'
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { ok, created, badReq, handle } from '@/lib/api-response'

const TYPES = ['webhook', 'rpa', 'synthetics', 'agent']
const PROVIDERS = ['bzzzbox', 'customer']

const COLS = 'id, client_id, type, label, provider, scope, ref, config, verify_state, verify_ts, verify_msg'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('autobotz_bindings')
      .select(COLS)
      .eq('org_id', org_id)
      .order('created_at', { ascending: true })
    if (error) throw error
    return ok({ bindings: data ?? [] })
  } catch (e) {
    return handle(e)
  }
}

export async function POST(request: NextRequest) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const body = await request.json().catch(() => null)
    if (!body || !TYPES.includes(body.type)) return badReq('Invalid type')
    if (!body.label || !body.ref) return badReq('label and ref are required')
    if (body.provider && !PROVIDERS.includes(body.provider)) return badReq('Invalid provider')

    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('autobotz_bindings')
      .insert({
        org_id,
        client_id: body.client_id ?? null,
        type: body.type,
        label: body.label,
        provider: body.provider ?? 'bzzzbox',
        scope: body.scope ?? 'company',
        ref: body.ref,
        config: body.config ?? {},
      })
      .select(COLS)
      .single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
