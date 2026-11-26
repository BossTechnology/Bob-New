// Starts the built app in box mode and checks the headers of real answers
// (ASVS 4.0.3 V1.14.4, V14.4). The unit tests check boxProxy; this checks
// that the build serves what boxProxy decides, X-Powered-By included.
//
// Run after `npm run build`:
//   node --experimental-strip-types scripts/ci/check-box-headers.mjs
//
// Nothing behind the box is up: GoTrue and the database point at closed
// ports. Every path the app can answer is requested (box-routes.mjs finds
// them): off routes answer 404, session routes 401 or a redirect without a
// session, and 503 with one, because the identity is down. Headers must be
// there on every answer.
import { spawn } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { securityHeaders } from '../../lib/bob/security-headers.ts'
import { boxRoutes } from './box-routes.mjs'

const PORT = Number(process.env.PORT ?? 3399)
const BASE = `http://127.0.0.1:${PORT}`

const dir = mkdtempSync(join(tmpdir(), 'bob-box-headers-'))
const secrets = join(dir, 'app.env')
// Example values only: nothing listens on the database port.
writeFileSync(secrets, 'BOB_APP_USUARIO=bob_app_example\nBOB_APP_CLAVE=example-only\n')

// next itself, not npx: npx would leave next running after a kill. Its own
// process group, so one signal stops whatever it starts.
const server = spawn(process.execPath, ['node_modules/next/dist/bin/next', 'start', '-p', String(PORT)], {
  detached: true,
  // Only what a box container has: the runner's own variables are not the box's,
  // and a secret-named one among them would (rightly) stop box mode.
  env: {
    PATH: process.env.PATH ?? '',
    HOME: process.env.HOME ?? '',
    NODE_ENV: 'production',
    BOB_CAJA: '1',
    BOB_ORG_ID: 'aaaaaaaa-0000-4000-8000-000000000001',
    BOB_GOTRUE_URL: 'http://127.0.0.1:9',
    BOB_PORTAL_URL: 'https://portal.example',
    BOB_DB_HOST: '127.0.0.1',
    BOB_DB_PORT: '9',
    BOB_SECRETS_FILE: secrets,
  },
  stdio: ['ignore', 'pipe', 'pipe'],
})
let output = ''
server.stdout.on('data', (d) => { output += d })
server.stderr.on('data', (d) => { output += d })

async function up() {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`next start exited (${server.exitCode})\n${output}`)
    try { await fetch(`${BASE}/login`, { redirect: 'manual' }); return } catch { /* not yet */ }
    await new Promise((r) => setTimeout(r, 500))
  }
  throw new Error(`next start did not answer\n${output}`)
}

const problems = []
const check = (label, res, data) => {
  const got = (h) => res.headers.get(h)
  // /entrar holds the portal's token in its URL until it clears it: no Referer at all (lib/bob/portal.ts).
  const want = label.split(/[ ?]/)[0] === '/entrar' ? { ...expected, 'Referrer-Policy': 'no-referrer' } : expected
  for (const [h, v] of Object.entries(want)) {
    if (got(h) !== v) problems.push(`${label} (${res.status}): ${h} is ${JSON.stringify(got(h))}`)
  }
  if (got('x-powered-by')) problems.push(`${label}: X-Powered-By is sent`)
  const disposition = data ? 'attachment' : null
  if (got('content-disposition') !== disposition) {
    problems.push(`${label}: Content-Disposition is ${JSON.stringify(got('content-disposition'))}`)
  }
}
const expected = securityHeaders(false)
const SESSION_COOKIE = { cookie: '__Host-bob-at=example-only' }
const statuses = {}

try {
  await up()
  for (const { path, access, data } of boxRoutes('.')) {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' })
    check(path, res, data)
    if (access === 'off' && res.status !== 404) problems.push(`${path}: off, but answered ${res.status}`)
    statuses[res.status] = (statuses[res.status] ?? 0) + 1
    if (access === 'session') {
      // With a session to check and GoTrue down: 503, never a pass.
      const down = await fetch(`${BASE}${path}`, { redirect: 'manual', headers: SESSION_COOKIE })
      check(`${path} (identity down)`, down, data)
      if (down.status !== 503) problems.push(`${path}: identity down, but answered ${down.status}`)
      statuses['503 identity down'] = (statuses['503 identity down'] ?? 0) + 1
    }
  }
  // The portal's token rides in /entrar's fragment, and a browser carries the
  // fragment over a 3xx: /entrar is a 200 itself, session cookie or not.
  for (const headers of [{}, SESSION_COOKIE, { cookie: '__Host-bob-portal=1' }]) {
    const res = await fetch(`${BASE}/entrar`, { redirect: 'manual', headers })
    if (res.status !== 200) problems.push(`/entrar ${JSON.stringify(headers)}: answered ${res.status}, not 200`)
  }
  console.log('answers by status:', JSON.stringify(statuses))
} catch (e) {
  problems.push(e instanceof Error ? e.message : String(e))
} finally {
  try { process.kill(-server.pid, 'SIGTERM') } catch { /* already gone */ }
  rmSync(dir, { recursive: true, force: true })
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('box headers: every answer carries them')
// The pipes to the stopped server must not keep this process alive.
process.exit(0)
