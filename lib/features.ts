// Feature flags — Backend Discovery §12.1. Stored in organizations.settings JSONB.
import { getServiceClient } from './supabase'

export async function isEnabled(orgId: string, feature: string): Promise<boolean> {
  const sb = getServiceClient()
  const { data } = await sb.from('organizations').select('settings').eq('id', orgId).single()
  const features = (data?.settings as { features?: Record<string, boolean> } | null)?.features
  return features?.[feature] ?? false
}
