// What a write must look like in the box (ASVS 4.0.3 V4.2.2, V13.1.5,
// V13.2.3, V13.2.5). Origin and Sec-Fetch-Site are only
// used to refuse, never to grant: who is asking is still the session's.
//
// The host is compared, not the scheme: TLS ends at the box's Traefik, which
// must pass Host through unchanged.
const READS = new Set(['GET', 'HEAD', 'OPTIONS'])

export type Refusal = { status: 403 | 415; error: string }

export function refuseWrite(method: string, headers: Headers, host: string): Refusal | null {
  if (READS.has(method)) return null

  const site = headers.get('sec-fetch-site')
  const crossSite = site !== null && site !== 'same-origin' && site !== 'none'
  const origin = headers.get('origin')
  const otherOrigin = origin !== null && (!URL.canParse(origin) || new URL(origin).host !== host)
  if (crossSite || otherOrigin) return { status: 403, error: 'Cross-origin request refused' }

  const type = headers.get('content-type')
  const hasBody = Number(headers.get('content-length') ?? 0) > 0 || headers.has('transfer-encoding')
  const notJson = type !== null
    ? type.split(';')[0].trim().toLowerCase() !== 'application/json'
    : hasBody
  return notJson ? { status: 415, error: 'Content-Type must be application/json' } : null
}
