// §5.10 GET /api/admin/orgs — all organizations (super-admin / internal only).
import { NextRequest } from 'next/server'
import { getServiceClient } from '@/lib/supabase'
import { requireService } from '@/lib/auth'
import { ok, handle } from '@/lib/api-response'

export async function GET(request: NextRequest) {
  try {
    requireService(request)
    const sb = getServiceClient()
    const { data, error } = await sb.from('organizations').select('*').order('created_at', { ascending: false })
    if (error) throw error
    return ok(data ?? [])
  } catch (e) {
    return handle(e)
  }
}
