// §5.10 GET /api/admin/metrics/usage — API/token usage metrics (internal only).
import { getServiceClient } from '@/lib/supabase'
import { requireService } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

export async function GET(request: Request) {
  try {
    requireService(request)
    const sb = getServiceClient()
    // usage_log is optional (see lib/claude.ts). Return zeros if not provisioned.
    const { data, error } = await sb.from('usage_log').select('model, input_tokens, output_tokens')
    if (error) return ok({ requests: 0, input_tokens: 0, output_tokens: 0, by_model: {} })
    const rows = (data || []) as { model: string; input_tokens: number; output_tokens: number }[]
    const by_model: Record<string, { input: number; output: number; calls: number }> = {}
    for (const r of rows) {
      const m = (by_model[r.model] ||= { input: 0, output: 0, calls: 0 })
      m.input += r.input_tokens || 0; m.output += r.output_tokens || 0; m.calls++
    }
    return ok({
      requests: rows.length,
      input_tokens: rows.reduce((a, r) => a + (r.input_tokens || 0), 0),
      output_tokens: rows.reduce((a, r) => a + (r.output_tokens || 0), 0),
      by_model,
    })
  } catch (e) {
    return handle(e)
  }
}
