// §5.8 GET /api/config/export — config as downloadable JSON.
import { getRouteClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { handle } from '@/lib/api-response'

export async function GET() {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const sb = await getRouteClient()
    const { data, error } = await sb.from('configurations').select('*')
      .eq('org_id', org_id).order('is_default', { ascending: false })
      .order('updated_at', { ascending: false }).limit(1).maybeSingle()
    if (error) throw error
    const date = new Date().toISOString().slice(0, 10)
    return new Response(JSON.stringify(data ?? {}, null, 2), {
      headers: {
        'Content-Type': 'application/json',
        'Content-Disposition': `attachment; filename="bob-config-${date}.json"`,
      },
    })
  } catch (e) {
    return handle(e)
  }
}
