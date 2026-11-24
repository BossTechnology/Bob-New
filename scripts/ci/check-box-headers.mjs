// Starts the built app in box mode and checks the headers of real answers
// (ASVS 4.0.3 V1.14.4, V14.4). The unit tests check boxProxy; this checks
// that the build serves what boxProxy decides, X-Powered-By included.
//
// Run after `npm run build`:
//   node --experimental-strip-types scripts/ci/check-box-headers.mjs
//
// Nothing behind the box is up: GoTrue and the database point at closed
// ports, so protected routes answer 503. Headers must be there anyway.
import { spawn } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { securityHeaders } from '../../lib/bob/security-headers.ts'

const PORT = Number(process.env.PORT ?? 3399)
const BASE = `http://127.0.0.1:${PORT}`

const dir = mkdtempSync(join(tmpdir(), 'bob-box-headers-'))
const secrets = join(dir, 'app.env')
// Example values only: nothing listens on the database port.
writeFileSync(secrets, 'BOB_APP_USUARIO=bob_app_example\nBOB_APP_CLAVE=example-only\n')

const server = spawn('npx', ['next', 'start', '-p', String(PORT)], {
  env: {
    ...process.env,
    BOB_CAJA: '1',
    BOB_ORG_ID: 'aaaaaaaa-0000-4000-8000-000000000001',
    BOB_GOTRUE_URL: 'http://127.0.0.1:9',
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

// Pages, then data (API and auth answers, on or off), which download.
const PAGES = ['/login', '/bob/performance', '/dashboard.html', '/no-such-page']
const DATA = ['/api/health', '/api/bob/interactions', '/api/config/thresholds', '/auth/me', '/api/ai']

const problems = []
try {
  await up()
  const expected = securityHeaders(false)
  for (const path of [...PAGES, ...DATA]) {
    const res = await fetch(`${BASE}${path}`, { redirect: 'manual' })
    const got = (h) => res.headers.get(h)
    for (const [h, v] of Object.entries(expected)) {
      if (got(h) !== v) problems.push(`${path} (${res.status}): ${h} is ${JSON.stringify(got(h))}`)
    }
    if (got('x-powered-by')) problems.push(`${path}: X-Powered-By is sent`)
    const disposition = DATA.includes(path) ? 'attachment' : null
    if (got('content-disposition') !== disposition) {
      problems.push(`${path}: Content-Disposition is ${JSON.stringify(got('content-disposition'))}`)
    }
    console.log(`${res.status} ${path}`)
  }
} catch (e) {
  problems.push(e instanceof Error ? e.message : String(e))
} finally {
  server.kill('SIGTERM')
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}
console.log('box headers: every answer carries them')
