// Signing out of the box: end the session at GoTrue (POST /auth/logout,
// which also clears the cookies), then replace the page with /login so the
// figures it showed leave the screen and the history (ASVS 4.0.3 V8.2.3).
// The page goes even if the request fails: the session then ends when its
// token expires, and nothing stays on screen meanwhile.
export async function signOut(
  post: (url: string, init?: RequestInit) => Promise<Response> = fetch,
  replace: (url: string) => void = (url) => window.location.replace(url),
) {
  try {
    await post('/auth/logout', { method: 'POST', credentials: 'same-origin' })
  } catch { /* the page still goes */ }
  replace('/login')
}
