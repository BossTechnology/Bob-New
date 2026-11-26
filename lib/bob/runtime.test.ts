import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  BobConfigError, assertBoxEnv, boxEnvProblems, proxyHops, dbTarget, gotrueUrl, parseEnvFile, readSecrets,
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

test('a password or key in the env is found by its name, not by a list', () => {
  // MIGRADOR_CLAVE is what Bzzz's alta writes (generar-secretos-vecina.sh); no list named it.
  for (const k of ['MIGRADOR_CLAVE', 'BOB_FEEDER_CLAVE', 'PGPASSWORD', 'DB_PASSWD', 'pgpassword', 'MY_API_KEY',
    'GITHUB_TOKEN', 'LLAVE_PRIVADA', 'OTRA_CONTRASENA', 'AWS_SECRET_ACCESS_KEY', 'SOME_CREDENTIALS', 'PG_DSN']) {
    const problems = boxEnvProblems(box({ [k]: 'x' }), mounted)
    assert.ok(problems.some((p) => p.startsWith(k)), k)
    assert.ok(!problems.join(' ').includes("'x'"), 'a value leaked into the message')
  }
})

test('the shell and the box env are not secrets', () => {
  // PWD and OLDPWD come from any shell; only *_PWD is a password.
  assert.deepEqual(boxEnvProblems(box({ PWD: '/app', OLDPWD: '/', HOME: '/', NODE_ENV: 'production', HOSTNAME: '0.0.0.0',
    PORT: '3000', NODE_OPTIONS: '--max-old-space-size=768', NEXT_TELEMETRY_DISABLED: '1' }), mounted), [])
  // Next sets these in its own process at start: a bare PRIVATE in the pattern stopped bob-web.
  assert.deepEqual(boxEnvProblems(box({ NEXT_PRIVATE_START_TIME: '1', __NEXT_PRIVATE_ORIGIN: 'http://localhost:3000' }), mounted), [])
})

test('a credential inside a URL is found by its value', () => {
  const problems = boxEnvProblems(box({ BOB_ALGO_URL: 'postgresql://bob_migrador:abc@bzzz-supabase-db:5432/postgres' }), mounted)
  assert.ok(problems.some((p) => p.startsWith('BOB_ALGO_URL')))
  assert.ok(!problems.join(' ').includes('abc'), 'a value leaked into the message')
  assert.deepEqual(boxEnvProblems(box({ BOB_GOTRUE_URL: 'http://bzzz-supabase-auth:9999' }), mounted), [])
})

test('a key-named variable that only points at a mounted file is not a secret', () => {
  const withKey = files({ '/run/secrets/bob/app.env': SECRETS, '/run/secrets/bob/vecinos.key': 'k' })
  assert.deepEqual(boxEnvProblems(box({ BOB_VECINOS_CLAVE: '/run/secrets/bob/vecinos.key' }), withKey), [])
  // Outside the mount point it is a value, and a value under that name is refused.
  assert.ok(boxEnvProblems(box({ BOB_VECINOS_CLAVE: '/tmp/vecinos.key' }), mounted).length)
  assert.ok(boxEnvProblems(box({ BOB_VECINOS_CLAVE: '/run/secrets/bob/../../etc/x' }), mounted).length)
  // *_FILE names hold a path (Docker's convention): BOB_SECRETS_FILE is one.
  assert.deepEqual(boxEnvProblems(box({ BOB_SECRETS_FILE: '/run/secrets/bob/app.env' }),
    files({ '/run/secrets/bob/app.env': SECRETS })), [])
  assert.ok(boxEnvProblems(box({ MIGRADOR_CLAVE_FILE: 'hunter2' }), mounted).length)
})

test('the box refuses to start with missing configuration, and names every gap', () => {
  const problems = boxEnvProblems({ BOB_CAJA: '1' }, files({}))
  assert.equal(problems.length, 3)
  assert.throws(() => assertBoxEnv({ BOB_CAJA: '1' }, files({})), BobConfigError)
})

test('outside the box nothing is asserted', () => {
  assertBoxEnv({ SUPABASE_SERVICE_ROLE_KEY: 'x' })
})

test('the number of trusted proxies is configuration, checked at start-up', () => {
  assert.equal(proxyHops({}), 1)
  assert.equal(proxyHops({ BOB_PROXY_HOPS: '2' }), 2)
  for (const bad of ['0', '-1', 'x', '1.5', '9']) assert.throws(() => proxyHops({ BOB_PROXY_HOPS: bad }), /BOB_PROXY_HOPS/)
  assert.match(boxEnvProblems(box({ BOB_PROXY_HOPS: 'x' }), mounted).join(), /BOB_PROXY_HOPS/)
})

// Review of #56 (defense in depth): what the first pattern let through.
const refused = (env: Record<string, string>, name: string, secret = 'x') => {
  const problems = boxEnvProblems(box(env), mounted)
  assert.ok(problems.some((p) => p.startsWith(name)), `${name} passed: ${JSON.stringify(problems)}`)
  assert.ok(!problems.join(' ').includes(secret), 'a value leaked into the message')
}

test('a password inside a connection string is found, whatever its shape', () => {
  refused({ PG_URL: 'postgres://h/db?user=bob_migrador&password=hunter2' }, 'PG_URL', 'hunter2')
  refused({ BOB_CONN: 'host=h user=bob_migrador password=hunter2' }, 'BOB_CONN', 'hunter2')
  refused({ BOB_ODBC: 'Server=h;Uid=bob;Pwd=hunter2;' }, 'BOB_ODBC', 'hunter2')
  refused({ BOB_ALGO_URL: 'postgresql://u:abc/def@h/postgres' }, 'BOB_ALGO_URL', 'abc/def')
})

test('a URL with a port and an @ in its path is not a password', () => {
  assert.deepEqual(boxEnvProblems(box({ BOB_REGISTRO: 'https://registry.example:443/@scope/pkg' }), mounted), [])
  assert.deepEqual(boxEnvProblems(box({ BOB_GOTRUE_URL: 'http://bzzz-supabase-auth:9999/?x=1' }), mounted), [])
})

test('the name pattern also catches PW, AUTH, PRIVATE, SIGNING and SALT', () => {
  for (const k of ['DB_PW', 'PGPW', 'BOB_APP_PW', 'PW', 'BASIC_AUTH', 'AUTH', 'PRIVATE', 'PRIVATE_PEM', 'SVC_PRIVATE_KEY', 'dbPwd', 'bobAppPwd', 'MIGRADOR_PW1', 'dbPw', 'SIGNING_PEM', 'SALT',
    'bob_salt']) refused({ [k]: 'x' }, k)
})

test('the forbidden list is matched whatever the case', () => {
  refused({ twilio_account_sid: 'AC0' }, 'twilio_account_sid', 'AC0')
  refused({ Slack_Webhook_Url: 'https://hooks.example/x' }, 'Slack_Webhook_Url', 'hooks.example')
})

test('a secret-named variable that names a file must name one that is there', () => {
  // The /run/secrets/bob/ exemption is for a path, not for any value that starts like one.
  refused({ MIGRADOR_CLAVE: '/run/secrets/bob/hunter2' }, 'MIGRADOR_CLAVE', 'hunter2')
  refused({ MIGRADOR_CLAVE_FILE: '/run/secrets/bob/no-esta' }, 'MIGRADOR_CLAVE_FILE', 'no-esta')
})

test('a service-role JWT is refused by its value, under any name', () => {
  const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
  const jwt = (role: string) => `${b64({ alg: 'HS256' })}.${b64({ role })}.firma`
  refused({ SB_JWT: jwt('service_role') }, 'SB_JWT', 'firma')
  refused({ BOB_ALGO: `Bearer ${jwt('service_role')}` }, 'BOB_ALGO', 'firma')
  assert.deepEqual(boxEnvProblems(box({ BOB_ALGO: jwt('anon') }), mounted), [])
})
