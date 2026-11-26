// /entrar — where the BzzzBX portal hands BOb its session (lib/bob/portal.ts).
// Box only; outside the box it does not exist.
import { notFound } from 'next/navigation'
import { isBox, portalUrl } from '@/lib/bob/runtime.ts'
import Handover from './handover'

export const dynamic = 'force-dynamic'

export default function EntrarPage() {
  if (!isBox()) notFound()
  return <Handover portal={`${portalUrl()}/`} />
}
