// §5.9 GET /api/reports/:id — fetch a generated report artifact (analyst+).
import { getServiceClient } from '@/lib/supabase'
import { requireAuth } from '@/lib/auth'
import { notFound, handle } from '@/lib/api-response'

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { org_id } = await requireAuth(['admin', 'analyst'])
    const { id } = await ctx.params
    const svc = getServiceClient()
    // id is the artifact filename within the org's folder.
    const signed = await svc.storage.from('reports').createSignedUrl(`${org_id}/${id}`, 60 * 60 * 24)
    if (signed.error || !signed.data?.signedUrl) return notFound()
    return Response.redirect(signed.data.signedUrl)
  } catch (e) {
    return handle(e)
  }
}
