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
const SCOPES = ['company', 'metric', 'entity', 'actor']

// D-20: provider is an open column per Data Model §3.4 — bzzzbx, customer, or a
// named integration. Shape is validated; membership is not, because a
// customer's own RPA vendor is a legitimate provider.
const PROVIDER_SHAPE = /^[a-z0-9][a-z0-9._-]{0,62}$/

const COLS = 'id, type, label, provider, scope_kind, scope_ref, reference, binding, enabled, requires_approval, mutative, verify_state, verified_at, verify_msg'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst', 'viewer'])
    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('autobotz')
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
    if (!body.label || !body.reference) return badReq('label and reference are required')
    if (body.provider && !PROVIDER_SHAPE.test(body.provider)) return badReq('Invalid provider')
    if (body.scope_kind && !SCOPES.includes(body.scope_kind)) return badReq('Invalid scope_kind')

    // BR-3 / D-10. A journey that checks a field is inert; a journey that
    // completes a checkout creates a real order. Same type, opposite risk, so
    // there is no default and no binding is registered without a ruling.
    if (typeof body.mutative !== 'boolean') {
      return badReq('mutative must be stated explicitly — true or false (BR-3)')
    }

    const sb = await getRouteClient()
    const { data, error } = await sb
      .from('autobotz')
      .insert({
        org_id,
        type: body.type,
        label: body.label,
        provider: body.provider ?? 'bzzzbx',
        scope_kind: body.scope_kind ?? 'company',
        scope_ref: body.scope_ref ?? null,
        reference: body.reference,
        binding: body.binding ?? {},
        mutative: body.mutative,
      })
      .select(COLS)
      .single()
    if (error) throw error
    return created(data)
  } catch (e) {
    return handle(e)
  }
}
