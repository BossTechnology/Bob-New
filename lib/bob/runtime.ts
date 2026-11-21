// Box mode and its runtime configuration (insumos de Bzzz §4.2, puntos 2, 4 y 5).
//
// BOB_CAJA=1 runs the app as BOb v1 inside a box. Then:
// - nothing box-specific comes from the build: the org, GoTrue and the database
//   host are read here, at run time, from variables with no NEXT_PUBLIC_ prefix;
// - the bob_app login is read from a mounted file (/run/secrets/bob/app.env),
//   never from the container's environment;
// - the service role, JWT_SECRET, the migration credential and the outbound
//   keys must not be present at all. assertBoxEnv() refuses to start if they are.
//
// Without BOB_CAJA the app is the Vercel demo, and BOB_DATABASE_URL (local
// stack, preview) is the only BOb connection setting.
import { readFileSync } from 'node:fs'

export class BobConfigError extends Error {}

type Env = Record<string, string | undefined>
type Reader = (path: string) => string

const defaultRead: Reader = (p) => readFileSync(p, 'utf8')

export const isBox = (env: Env = process.env) => env.BOB_CAJA === '1'

export const SECRETS_FILE = '/run/secrets/bob/app.env'

// Names only: what a box must never hand to BOb (P5 §3.4, insumos §5.1).
export const FORBIDDEN_IN_BOX = [
  'SUPABASE_SERVICE_ROLE_KEY', 'SERVICE_ROLE_KEY', 'JWT_SECRET', 'GOTRUE_JWT_SECRET',
  'POSTGRES_PASSWORD', 'BOB_MIGRADOR_USUARIO', 'BOB_MIGRADOR_CLAVE',
  // A credential in the environment is readable through the Docker API (§5.1).
  'BOB_DATABASE_URL', 'BOB_APP_CLAVE',
  'ANTHROPIC_API_KEY', 'TWILIO_ACCOUNT_SID', 'TWILIO_AUTH_TOKEN', 'RESEND_API_KEY',
  'SLACK_WEBHOOK_URL', 'CRON_SECRET', 'INTERNAL_SERVICE_API_KEY',
] as const

// KEY=VALUE lines; blank lines and # comments ignored; optional quotes.
export function parseEnvFile(text: string): Record<string, string> {
  const out: Record<string, string> = {}
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim()
    if (!line || line.startsWith('#')) continue
    const eq = line.indexOf('=')
    if (eq <= 0) continue
    const key = line.slice(0, eq).replace(/^export\s+/, '').trim()
    let value = line.slice(eq + 1).trim()
    if (value.length >= 2 && (value[0] === '"' || value[0] === "'") && value.at(-1) === value[0]) {
      value = value.slice(1, -1)
    }
    out[key] = value
  }
  return out
}

export function readSecrets(env: Env = process.env, read: Reader = defaultRead) {
  const path = env.BOB_SECRETS_FILE || SECRETS_FILE
  let text: string
  try {
    text = read(path)
  } catch {
    throw new BobConfigError(`no se pudo leer el fichero de secretos ${path}`)
  }
  const s = parseEnvFile(text)
  if (!s.BOB_APP_USUARIO || !s.BOB_APP_CLAVE) {
    throw new BobConfigError(`${path} no trae BOB_APP_USUARIO y BOB_APP_CLAVE`)
  }
  return { user: s.BOB_APP_USUARIO, password: s.BOB_APP_CLAVE }
}

export type DbTarget =
  | { kind: 'url'; connectionString: string }
  | { kind: 'params'; host: string; port: number; database: string; user: string; password: string }

export function dbTarget(env: Env = process.env, read: Reader = defaultRead): DbTarget {
  if (!isBox(env)) {
    if (!env.BOB_DATABASE_URL) throw new BobConfigError('BOB_DATABASE_URL no está definida')
    return { kind: 'url', connectionString: env.BOB_DATABASE_URL }
  }
  if (!env.BOB_DB_HOST) throw new BobConfigError('BOB_DB_HOST no está definida')
  const port = Number(env.BOB_DB_PORT || 5432)
  if (!Number.isInteger(port) || port <= 0) throw new BobConfigError('BOB_DB_PORT no es un puerto')
  const { user, password } = readSecrets(env, read)
  return { kind: 'params', host: env.BOB_DB_HOST, port, database: env.BOB_DB_NAME || 'postgres', user, password }
}

export function boxOrgId(env: Env = process.env): string {
  const id = env.BOB_ORG_ID
  if (!id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    throw new BobConfigError('BOB_ORG_ID no está definida o no es un UUID')
  }
  return id
}

// GoTrue inside the box serves at its root (no /auth/v1: that prefix is the
// gateway's). Reached over bzzz-app, never through Traefik (insumos §3.4).
export function gotrueUrl(env: Env = process.env): string {
  const u = env.BOB_GOTRUE_URL
  if (!u || !/^https?:\/\/[^/\s]+/.test(u)) throw new BobConfigError('BOB_GOTRUE_URL no está definida')
  return u.replace(/\/+$/, '')
}

// Every problem at once, by name, never by value. Empty means it may start.
export function boxEnvProblems(env: Env = process.env, read: Reader = defaultRead): string[] {
  const problems: string[] = []
  for (const k of FORBIDDEN_IN_BOX) if (env[k]) problems.push(`${k} no debe estar en la caja`)
  const checks: [string, () => unknown][] = [
    ['BOB_ORG_ID', () => boxOrgId(env)],
    ['BOB_GOTRUE_URL', () => gotrueUrl(env)],
    ['BOB_DB_HOST', () => dbTarget(env, read)],
  ]
  for (const [, check] of checks) {
    try { check() } catch (e) { problems.push((e as Error).message) }
  }
  return problems
}

export function assertBoxEnv(env: Env = process.env, read: Reader = defaultRead): void {
  if (!isBox(env)) return
  const problems = boxEnvProblems(env, read)
  if (problems.length) throw new BobConfigError(`BOb no arranca en modo caja: ${problems.join('; ')}`)
}
