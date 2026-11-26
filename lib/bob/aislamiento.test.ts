// deploy/caja/comprobar-aislamiento.sh against a fake docker: every guard of the
// "secreto" and "montaje" families, each seen failing. The script runs in the
// bench mode fijos.sh allows (BOB_BANCO=1, a marker file, no /opt/bzzz), so
// BOB_RAIZ is a temporary directory and nothing here touches a real daemon.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const SCRIPT = fileURLToPath(new URL('../../deploy/caja/comprobar-aislamiento.sh', import.meta.url))
const python = spawnSync('python3', ['-c', 'pass']).status === 0
const skip = existsSync('/opt/bzzz') || !python ? 'needs python3 and a machine without /opt/bzzz' : false

type Mount = { Type?: string; Source: string; Destination: string }
type Box = { env?: string[]; mounts?: Mount[]; files?: Record<string, string> }

const LOGIN = 'BOB_APP_USUARIO=bob_app_login\nBOB_APP_CLAVE=banco\n'

function run({ env = [], mounts, files = {} }: Box) {
  const d = mkdtempSync(join(tmpdir(), 'aislamiento-'))
  try {
    const raiz = join(d, 'opt-bob')
    mkdirSync(join(raiz, 'config'), { recursive: true })
    mkdirSync(join(raiz, 'secrets'), { recursive: true })
    mkdirSync(join(d, 'bin'))
    const all = { 'secrets/app.env': LOGIN, ...files }
    for (const [p, text] of Object.entries(all)) writeFileSync(join(raiz, p), text)
    const m = (mounts ?? [{ Source: 'secrets/app.env', Destination: '/run/secrets/bob/app.env' }])
      .map((x) => ({ Type: 'bind', ...x, Source: join(raiz, x.Source) }))
    const web = {
      Name: '/bob-web',
      Config: { Labels: { 'com.docker.compose.project': 'bob', 'com.docker.compose.service': 'bob-web' }, Env: env },
      HostConfig: { NetworkMode: 'bzzz-vecina-bob', PortBindings: {} },
      NetworkSettings: { Networks: { 'bzzz-vecina-bob': {}, 'bzzz-edge': {} } },
      Mounts: m,
    }
    const redes = [{ Name: 'bzzz-vecina-bob', Internal: true }, { Name: 'bzzz-edge', Internal: false }]
    writeFileSync(join(d, 'contenedores.json'), JSON.stringify([web]))
    writeFileSync(join(d, 'redes.json'), JSON.stringify(redes))
    const docker = join(d, 'bin', 'docker')
    writeFileSync(docker, `#!/usr/bin/env bash
case "$1 $2" in
  "ps -aq") echo c1 ;;
  "network ls") echo n1 ;;
  "network inspect") cat '${d}/redes.json' ;;
  inspect*) cat '${d}/contenedores.json' ;;
  *) exit 1 ;;
esac
`)
    chmodSync(docker, 0o755)
    writeFileSync(join(d, 'marca'), `banco-bobcaja ${d}\n`)
    const r = spawnSync('bash', [SCRIPT], {
      encoding: 'utf8',
      env: { PATH: `${d}/bin:${process.env.PATH}`, NODE_ENV: 'test', HOME: d, BOB_BANCO: '1', BOB_BANCO_MARCA: join(d, 'marca'), BOB_RAIZ: raiz },
    })
    return { rc: r.status, out: r.stdout + r.stderr }
  } finally {
    rmSync(d, { recursive: true, force: true })
  }
}

const isolated = (b: Box) => {
  const r = run(b)
  assert.equal(r.rc, 0, r.out)
  assert.match(r.out, /^aislada:/)
}
const caught = (b: Box, why: RegExp, secret = 'hunter2') => {
  const r = run(b)
  assert.equal(r.rc, 1, r.out)
  assert.match(r.out, why)
  assert.ok(!r.out.includes(secret), `the value leaked: ${r.out}`)
}

test('a clean bob-web is isolated (the harness itself)', { skip }, () => {
  isolated({})
  // A secret-named variable that names a file this container mounts is a path, not a secret.
  isolated({ env: ['BOB_ALGO_CLAVE=/run/secrets/bob/app.env', 'BOB_SECRETS_FILE=/run/secrets/bob/app.env'] })
  isolated({ env: ['BOB_REGISTRO=https://registry.example:443/@scope/pkg', 'BOB_GOTRUE_URL=http://bzzz-supabase-auth:9999'] })
})

test('a password in a connection string in the env is caught, whatever its shape', { skip }, () => {
  caught({ env: ['PG_URL=postgres://h/db?user=bob_migrador&password=hunter2'] }, /PG_URL/)
  caught({ env: ['BOB_CONN=host=h user=bob_migrador password=hunter2'] }, /BOB_CONN/)
  caught({ env: ['BOB_ALGO_URL=postgresql://u:hunter2/x@h/postgres'] }, /BOB_ALGO_URL/)
})

test('PW, AUTH, PRIVATE, SIGNING and SALT names, and the list in any case', { skip }, () => {
  for (const k of ['DB_PW', 'PGPW', 'BOB_APP_PW', 'BASIC_AUTH', 'PRIVATE_PEM', 'SIGNING_PEM', 'SALT', 'twilio_account_sid']) {
    caught({ env: [`${k}=hunter2`] }, new RegExp(k))
  }
})

test('a secret-named variable under /run/secrets/bob/ must be a file this container mounts', { skip }, () => {
  caught({ env: ['MIGRADOR_CLAVE=/run/secrets/bob/hunter2'] }, /MIGRADOR_CLAVE/)
})

test('a mounted file is read whole: lines without = are checked too', { skip }, () => {
  caught({ files: { 'secrets/app.env': LOGIN + 'postgresql://bob_migrador:hunter2@h/postgres\n' } }, /contraseña/)
  caught({ files: { 'secrets/app.env': LOGIN + 'h:5432:postgres:bob_migrador:hunter2\n' } }, /pgpass/)
  caught({ files: { 'secrets/app.env': LOGIN + 'BOB_X=postgresql://u:hunter2@h/db\n' } }, /BOB_X/)
  const json = { Source: 'config/x.json', Destination: '/app/x.json' }
  const base = { Source: 'secrets/app.env', Destination: '/run/secrets/bob/app.env' }
  caught({ mounts: [base, json], files: { 'config/x.json': '{"db": {"password": "hunter2"}}\n' } }, /x\.json/)
  caught({ mounts: [base, json], files: { 'config/x.json': 'db:\n  password: hunter2\n' } }, /x\.json/)
})

test('migrador.env is never mounted, under any path', { skip }, () => {
  const base = { Source: 'secrets/app.env', Destination: '/run/secrets/bob/app.env' }
  caught({ mounts: [base, { Source: 'secrets/migrador.env', Destination: '/run/secrets/bob/otro.env' }],
    files: { 'secrets/migrador.env': '' } }, /migrador\.env/)
})

test('the own-login exemption holds only for that container, only in secrets/', { skip }, () => {
  // BOB_APP_CLAVE is bob-web's own login, but in config/ it is a leak.
  caught({ mounts: [{ Source: 'config/app.env', Destination: '/run/secrets/bob/app.env' }],
    files: { 'config/app.env': 'BOB_APP_USUARIO=bob_app_login\nBOB_APP_CLAVE=hunter2\n' } }, /BOB_APP_CLAVE/)
  // The feeder's login is not bob-web's.
  caught({ files: { 'secrets/app.env': LOGIN + 'BOB_FEEDER_CLAVE=hunter2\n' } }, /BOB_FEEDER_CLAVE/)
})

// Second review of #59: a line with «=» was only read as KEY=VALUE, and the JWT checks had no case of their own.
test('a mounted line with = is also read whole', { skip }, () => {
  caught({ files: { 'secrets/app.env': LOGIN + 'postgresql://bob_migrador:hunter2@h/db?sslmode=require\n' } }, /contraseña/)
  caught({ files: { 'secrets/app.env': LOGIN + '{"url":"postgres://bob_migrador:hunter2@h/db?ssl=1"}\n' } }, /contraseña/)
  caught({ files: { 'secrets/app.env': LOGIN + 'h:5432:postgres:bob_migrador:hun=ter2\n' } }, /pgpass/, 'hun=ter2')
})

const b64 = (o: object) => Buffer.from(JSON.stringify(o)).toString('base64url')
const JWT_SR = `${b64({ alg: 'HS256' })}.${b64({ role: 'service_role' })}.hunter2`

test('a service-role JWT is caught in the env, under any name', { skip }, () => {
  caught({ env: [`BOB_ALGO=${JWT_SR}`] }, /BOB_ALGO es un JWT con role=service_role/)
})

test('a service-role JWT is caught in a mounted file, under any name', { skip }, () => {
  caught({ files: { 'secrets/app.env': LOGIN + `BOB_ALGO=${JWT_SR}\n` } }, /trae un JWT con role=service_role/)
})
