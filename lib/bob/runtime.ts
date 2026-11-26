// Box mode and its runtime configuration (insumos de Bzzz §4.2, puntos 2, 4 y 5).
//
// BOB_CAJA=1 runs the app as BOb v1 inside a box. Then:
// - nothing box-specific comes from the build: the org, GoTrue and the database
//   host are read here, at run time, from variables with no NEXT_PUBLIC_ prefix;
// - the bob_app login is read from a mounted file (/run/secrets/bob/app.env),
//   never from the container's environment;
// - no password, key or token may be in the environment at all: the service
//   role, JWT_SECRET, the migration credential, the outbound keys. They are
//   found by name pattern, not by a list (a new name is caught without anyone
//   adding it). assertBoxEnv() refuses to start if one is there.
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

// What a box must never hand to BOb in its environment (P5 §3.4, insumos §5.1).
// A credential in the environment is readable through the Docker API (§5.1).
//
// SECRET_NAME discovers: any variable whose name says password, key, token,
// secret or credential, in English or Spanish, whatever its prefix (Bzzz's alta
// writes MIGRADOR_CLAVE; a list of BOB_MIGRADOR_* names missed it). Case does
// not matter. deploy/caja/comprobar-aislamiento.sh uses the same pattern;
// lib/bob/caja-compose.test.ts fails if the two drift apart.
export const SECRET_NAME = /PASS|_PWD|CLAVE|CONTRASE|SECRET|TOKEN|LLAVE|KEY|CREDENTIAL|CREDENCIAL|SERVICE_ROLE|DATABASE_URL|DSN/i

// The few names the pattern does not see: never in the box either.
export const FORBIDDEN_IN_BOX = [
  'TWILIO_ACCOUNT_SID', 'SLACK_WEBHOOK_URL',
] as const

// A secret-named variable may hold the path of a file: one mounted here (the
// feeder's BOB_VECINOS_CLAVE), or any absolute path under a *_FILE name (the
// Docker convention, BOB_SECRETS_FILE). The path is not the secret, the file is,
// and the isolation check reads mounted files.
export const MOUNTED_SECRETS = '/run/secrets/bob/'
const isPath = (v: string) => /^\/[^\s]*$/.test(v) && !v.split('/').includes('..')
const isFileRef = (name: string, v: string) =>
  isPath(v) && (v.startsWith(MOUNTED_SECRETS) || /_FILE$/i.test(name))

// scheme://user:password@host: a credential carried in a value, whatever the name.
export const URL_WITH_PASSWORD = /[a-z][a-z0-9+.-]*:\/\/[^\s/:@]*:[^\s/@]+@/i

// Why a variable must not be in the box's environment, or null. Never echoes the value.
export function forbiddenEnv(name: string, value: string): string | null {
  if ((FORBIDDEN_IN_BOX as readonly string[]).includes(name)) return 'no debe estar en la caja'
  if (SECRET_NAME.test(name) && !isFileRef(name, value)) return 'parece una contraseña o una llave y no debe estar en la caja'
  if (URL_WITH_PASSWORD.test(value)) return 'lleva una contraseña dentro de una URL y no debe estar en la caja'
  return null
}

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
// How many proxies in front of bob-web append to X-Forwarded-For. In a box it
// is Traefik alone: 1. The client address is the entry the outermost trusted
// proxy wrote; anything before it is whatever the client sent.
export function proxyHops(env: Env = process.env): number {
  const raw = env.BOB_PROXY_HOPS ?? '1'
  if (!/^[1-5]$/.test(raw)) throw new BobConfigError('BOB_PROXY_HOPS debe ser un entero de 1 a 5')
  return Number(raw)
}

export function boxEnvProblems(env: Env = process.env, read: Reader = defaultRead): string[] {
  const problems: string[] = []
  for (const [k, v] of Object.entries(env)) {
    if (!v) continue
    const why = forbiddenEnv(k, v)
    if (why) problems.push(`${k} ${why}`)
  }
  const checks: [string, () => unknown][] = [
    ['BOB_ORG_ID', () => boxOrgId(env)],
    ['BOB_GOTRUE_URL', () => gotrueUrl(env)],
    ['BOB_DB_HOST', () => dbTarget(env, read)],
    ['BOB_PROXY_HOPS', () => proxyHops(env)],
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
