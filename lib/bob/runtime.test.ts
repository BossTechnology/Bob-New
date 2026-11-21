import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BobConfigError, assertBoxEnv, boxEnvProblems, dbTarget, gotrueUrl, parseEnvFile, readSecrets,
} from './runtime.ts'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const SECRETS = 'BOB_APP_USUARIO=bob_app_login\nBOB_APP_CLAVE="s3cret"\n'
const box = (extra: Record<string, string> = {}) => ({
  BOB_CAJA: '1', BOB_ORG_ID: ORG, BOB_GOTRUE_URL: 'http://bzzz-supabase-auth:9999/',
  BOB_DB_HOST: 'bzzz-supabase-db', ...extra,
})
const files = (map: Record<string, string>) => (p: string) => {
  if (!(p in map)) throw new Error('ENOENT')
  return map[p]
}
const mounted = files({ '/run/secrets/bob/app.env': SECRETS })

test('parseEnvFile reads KEY=VALUE, quotes and comments', () => {
  assert.deepEqual(parseEnvFile('# c\n\nA=1\nexport B="two words"\nC=\'x\'\nbad line\n'),
    { A: '1', B: 'two words', C: 'x' })
})

test('in the box the bob_app login comes from the mounted file, not the environment', () => {
  const t = dbTarget(box(), mounted)
  assert.deepEqual(t, {
    kind: 'params', host: 'bzzz-supabase-db', port: 5432, database: 'postgres',
    user: 'bob_app_login', password: 's3cret',
  })
})

test('in the box a missing or incomplete secrets file is refused', () => {
  assert.throws(() => dbTarget(box(), files({})), BobConfigError)
  assert.throws(() => readSecrets(box(), files({ '/run/secrets/bob/app.env': 'BOB_APP_USUARIO=x' })),
    BobConfigError)
})

test('outside the box BOB_DATABASE_URL is the connection', () => {
  assert.deepEqual(dbTarget({ BOB_DATABASE_URL: 'postgresql://x/y' }),
    { kind: 'url', connectionString: 'postgresql://x/y' })
  assert.throws(() => dbTarget({}), BobConfigError)
})

test('GoTrue is addressed at its root, at run time', () => {
  assert.equal(gotrueUrl(box()), 'http://bzzz-supabase-auth:9999')
  assert.throws(() => gotrueUrl({}), BobConfigError)
})

test('a complete box configuration starts', () => {
  assert.deepEqual(boxEnvProblems(box(), mounted), [])
  assertBoxEnv(box(), mounted)
})

test('the box refuses to start with the service role, JWT secret or a credential in the env', () => {
  for (const k of ['SUPABASE_SERVICE_ROLE_KEY', 'JWT_SECRET', 'BOB_DATABASE_URL', 'BOB_MIGRADOR_CLAVE',
    'ANTHROPIC_API_KEY', 'TWILIO_AUTH_TOKEN', 'RESEND_API_KEY']) {
    const problems = boxEnvProblems(box({ [k]: 'x' }), mounted)
    assert.ok(problems.some((p) => p.startsWith(k)), k)
    assert.ok(!problems.join(' ').includes("'x'"), 'a value leaked into the message')
    assert.throws(() => assertBoxEnv(box({ [k]: 'x' }), mounted), BobConfigError)
  }
})

test('the box refuses to start with missing configuration, and names every gap', () => {
  const problems = boxEnvProblems({ BOB_CAJA: '1' }, files({}))
  assert.equal(problems.length, 3)
  assert.throws(() => assertBoxEnv({ BOB_CAJA: '1' }, files({})), BobConfigError)
})

test('outside the box nothing is asserted', () => {
  assertBoxEnv({ SUPABASE_SERVICE_ROLE_KEY: 'x' })
})
