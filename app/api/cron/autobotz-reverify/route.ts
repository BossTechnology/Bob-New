// §7 GET /api/cron/autobotz-reverify — re-check AutoBotz bindings on a schedule.
//
// v5.3 lists this as not started: "Freshness is tracked and stale states render,
// but nothing re-checks. Belongs in a Vercel cron alongside the existing nine."
//
// Verification resolves a reference; it never invokes it. A HEAD carries no body
// and does not trigger a webhook, an RPA job or an agent, which is what keeps
// this "safe, no side effects, no cost" as the specification requires.
//
// HONESTY RULE — the one thing not to get wrong here. A reference this cron
// cannot actually reach is left `unverified` with the reason recorded, never
// marked `ok`. Only `provider:'customer'` bindings carrying an absolute URL are
// resolvable today; `provider:'bzzzbox'` has no API in this deployment, so those
// stay unverified until BzzzBX exists. A fabricated `ok` would be worse than no
// cron at all: it turns "nobody checked" into "we checked and it was fine".
import { requireCron } from '@/lib/auth'
import { getServiceClient } from '@/lib/supabase'
import { activeOrgIds } from '@/lib/cron'
import { handle } from '@/lib/api-response'

// Mirrors AB_STALE_MS in the simulator: a verification older than 30 days is
// not evidence. Keep the two in step if either moves.
const STALE_MS = 30 * 864e5
const BATCH_PER_ORG = 50
const PROBE_TIMEOUT_MS = 8000

type Binding = {
  id: string
  label: string
  provider: string
  ref: string
  verify_state: string
  verify_msg: string
}

type Probe = { state: 'ok' | 'failed' | 'unverified'; msg: string }

// Blocks loopback, private and link-local targets. Bindings are written by
// authenticated admins, but a scheduled job that fetches stored URLs is an SSRF
// path, and cloud metadata endpoints sit on 169.254.169.254.
function isPublicHost(host: string): boolean {
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.internal')) return false
  if (host === '[::1]' || host === '::1') return false
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host)
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])]
    if (a === 127 || a === 10 || a === 0) return false
    if (a === 169 && b === 254) return false
    if (a === 192 && b === 168) return false
    if (a === 172 && b >= 16 && b <= 31) return false
  }
  return true
}

async function probe(b: Binding): Promise<Probe> {
  if (b.provider !== 'customer') {
    return { state: 'unverified', msg: 'No BzzzBX integration in this deployment — not checked' }
  }
  let url: URL
  try {
    url = new URL(b.ref)
  } catch {
    return { state: 'unverified', msg: 'Reference is not an absolute URL — not checked' }
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    return { state: 'unverified', msg: `Unsupported scheme ${url.protocol} — not checked` }
  }
  if (!isPublicHost(url.hostname)) {
    return { state: 'unverified', msg: 'Reference points at a private address — not checked' }
  }

  try {
    const res = await fetch(url, {
      method: 'HEAD',
      redirect: 'follow',
      signal: AbortSignal.timeout(PROBE_TIMEOUT_MS),
    })
    // The question is whether the reference still exists, not whether it will
    // serve us. 401/403 prove it is there and guarded; 405/501 prove it is
    // there and does not take HEAD. Both resolve.
    if (res.ok || res.status === 401 || res.status === 403 || res.status === 405 || res.status === 501) {
      return { state: 'ok', msg: `Reference resolved — ${res.status}` }
    }
    if (res.status === 404 || res.status === 410) {
      return { state: 'failed', msg: `Reference is gone — ${res.status}` }
    }
    return { state: 'failed', msg: `Unexpected response — ${res.status}` }
  } catch (e) {
    const msg = e instanceof Error && e.name === 'TimeoutError' ? `No response in ${PROBE_TIMEOUT_MS / 1000}s` : 'Unreachable'
    return { state: 'failed', msg }
  }
}

export async function GET(request: Request) {
  const start = Date.now()
  try {
    requireCron(request)
    const sb = getServiceClient()
    const cutoff = new Date(Date.now() - STALE_MS).toISOString()

    let checked = 0
    let resolved = 0
    let failed = 0
    let skipped = 0

    for (const orgId of await activeOrgIds()) {
      // Due for a re-check: never verified, or last verified beyond the window.
      // `pending` is a transient client state and is re-checked too.
      const { data, error } = await sb
        .from('autobotz_bindings')
        .select('id, label, provider, ref, verify_state, verify_msg')
        .eq('org_id', orgId)
        .or(`verify_ts.is.null,verify_ts.lt.${cutoff}`)
        .order('verify_ts', { ascending: true, nullsFirst: true })
        .limit(BATCH_PER_ORG)
      if (error) throw error

      for (const b of (data as Binding[]) || []) {
        const result = await probe(b)
        checked++
        if (result.state === 'ok') resolved++
        else if (result.state === 'failed') failed++
        else skipped++

        await sb
          .from('autobotz_bindings')
          .update({
            verify_state: result.state,
            // An unverified result is not evidence, so it carries no timestamp —
            // which also leaves the binding due on the next run rather than
            // parking it for another 30 days.
            verify_ts: result.state === 'unverified' ? null : new Date().toISOString(),
            verify_msg: result.msg,
          })
          .eq('id', b.id)
          .eq('org_id', orgId)

        // "A failed verification raises an alert like any other breach" (§4.5).
        // Same shape the simulator writes from verifyAB(), so both paths land
        // identically in the alert log.
        if (result.state === 'failed' && b.verify_state !== 'failed') {
          await sb.from('alert_log').insert({
            org_id: orgId,
            metric_id: 'autobotz',
            metric_name: `AutoBotz: ${b.label}`,
            alert_type: 'upper',
            value: 1,
            threshold: 0,
            severity: 'critical',
            responses_fired: [],
          })
        }
      }
    }

    return Response.json({
      ok: true,
      checked,
      resolved,
      failed,
      // Reported rather than hidden: these are references the cron could not
      // reach, not references that passed.
      not_checked: skipped,
      duration_ms: Date.now() - start,
    })
  } catch (e) {
    return handle(e)
  }
}
