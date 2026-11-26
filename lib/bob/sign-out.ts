// Signing out of the box: end the session at GoTrue (POST /auth/logout,
// which also clears the cookies), then replace the page with /login so the
// figures it showed leave the screen and the history (ASVS 4.0.3 V8.2.3).
// The page goes even if the request fails or GoTrue could not revoke the
// session (the answer says revoked: false, and the server logs it): the
// cookies are cleared either way, the access token stays valid until it
// expires, and nothing stays on screen meanwhile.
export async function signOut(
  post: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  replace: (url: string) => void = (url) => window.location.replace(url),
) {
  let next = '/login'
  try {
    const r = await post('/auth/logout', { method: 'POST', credentials: 'same-origin' })
    // In the box the answer names the portal's way out (Henry, 2026-11-26).
    const named = (await r.json().catch(() => null))?.data?.next
    if (typeof named === 'string' && /^https:\/\/[^/?#@\s]+\/\?salir=1$/.test(named)) next = named
  } catch { /* the page still goes */ }
  replace(next)
}
