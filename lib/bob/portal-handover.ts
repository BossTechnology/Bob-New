// /entrar's side of the portal handover, in the browser (lib/bob/portal.ts has
// the whole story). Nothing here may import server code: the client
// component bundles this file.
const HOME = '/bob/performance'

// One of BOb's own paths, or the screens. Never another origin, never the
// handover itself or /login (each would go straight back to the portal).
export function safeNext(ir: unknown): string {
  if (typeof ir !== 'string' || !/^\/(?![/\\])[\x21-\x7e]*$/.test(ir) || /%0[ad]/i.test(ir)) return HOME
  const path = ir.split(/[?#]/)[0]
  if (path === '/entrar' || path === '/login') return HOME
  return ir
}

export type HandoverDeps = {
  hash: string
  clearHash: () => void
  post: (url: string, init?: RequestInit) => Promise<Response>
  replace: (url: string) => void
  show: (message: string) => void
}

export const HANDOVER_TEXT = {
  missing: 'BOb no recibió la sesión de BzzzBX.',
  refused: 'La sesión de BzzzBX no es válida o caducó.',
  unavailable: 'La identidad de la caja no responde. Vuelve a intentarlo en un momento.',
} as const

// /entrar, in the browser. The fragment goes first, whatever happens next.
// It never sends the person back to the portal by itself: that is the link
// on the page, so a failed handover cannot become a loop.
export async function handover(d: HandoverDeps): Promise<void> {
  const p = new URLSearchParams(d.hash.replace(/^#/, ''))
  d.clearHash()
  const token = p.get('bob_at')
  if (!token) return d.show(HANDOVER_TEXT.missing)
  let status: number
  try {
    const r = await d.post('/auth/portal', {
      method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ access_token: token }),
    })
    status = r.status
  } catch {
    return d.show(HANDOVER_TEXT.unavailable)
  }
  if (status === 200) return d.replace(safeNext(p.get('ir')))
  d.show(status === 503 ? HANDOVER_TEXT.unavailable : HANDOVER_TEXT.refused)
}
