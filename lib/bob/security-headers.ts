// The browser-side headers of every answer in the box (ASVS 4.0.3 V14.4,
// docs/asvs-l2-box.md). Set by boxProxy, so they apply only with BOB_CAJA=1;
// the Vercel demo is unchanged.
//
// script-src keeps 'unsafe-inline': the simulator (public/dashboard.html) has
// inline scripts and onclick handlers, and Next's pages inline their payload.
// What this CSP still closes: other origins for scripts, frames, plugins,
// <base>, form targets and fetch/XHR (connect-src 'self'). Moving the
// simulator off inline handlers is what would let 'unsafe-inline' go.
//
// No Strict-Transport-Security here: TLS ends at the box's Traefik, which owns
// HSTS (stage 4).
const csp = (dev: boolean) => [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${dev ? " 'unsafe-eval'" : ''}`,
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob:",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ')

export function securityHeaders(dev = process.env.NODE_ENV === 'development'): Record<string, string> {
  return {
    'Content-Security-Policy': csp(dev),
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  }
}

export function withSecurityHeaders<R extends Response>(r: R): R {
  for (const [k, v] of Object.entries(securityHeaders())) r.headers.set(k, v)
  return r
}
