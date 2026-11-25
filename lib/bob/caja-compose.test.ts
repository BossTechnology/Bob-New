// The compose that runs BOb next to the box (deploy/caja/compose.yml, Bzzz D77).
//
// Reads what `docker compose config` resolves, not the YAML text, so an anchor,
// a default or a profile cannot hide a published port or a secret in the
// environment. Needs docker: in CI (CI=true) a missing docker fails; on a
// laptop without it the test is skipped and says so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { FORBIDDEN_IN_BOX } from './runtime.ts'

const COMPOSE = new URL('../../deploy/caja/compose.yml', import.meta.url).pathname
const WEB_ID = 'sha256:' + 'a'.repeat(64)
const FEEDER_ID = 'sha256:' + 'b'.repeat(64)
const hasDocker = spawnSync('docker', ['compose', 'version']).status === 0
const skip = !hasDocker && !process.env.CI ? 'docker compose is not available here' : false

type Service = {
  image: string; user?: string; read_only?: boolean; ports?: unknown[]
  cap_drop?: string[]; security_opt?: string[]; container_name?: string
  environment?: Record<string, string>; labels?: Record<string, string>
  networks?: Record<string, unknown>; profiles?: string[]
  volumes?: { type: string; source: string; target: string; read_only?: boolean }[]
  deploy?: { resources?: { limits?: { cpus?: number; memory?: string; pids?: number } } }
}
type Config = { services: Record<string, Service>; networks: Record<string, { name: string; external?: boolean }> }

function config(env: Record<string, string>): Config {
  const out = execFileSync('docker', ['compose', '-p', 'bob', '-f', COMPOSE, '--profile', 'feeder',
    'config', '--no-env-resolution', '--format', 'json'],
  { env: { PATH: process.env.PATH ?? '', HOME: process.env.HOME ?? '', ...env } as unknown as NodeJS.ProcessEnv, encoding: 'utf8' })
  return JSON.parse(out)
}
const full = () => config({ BOB_WEB_IMAGEN: WEB_ID, BOB_FEEDER_IMAGEN: FEEDER_ID, BOB_HOST: 'bob.example.test' })

test('both services are bob-*, by image id, hardened and capped', { skip }, () => {
  const c = full()
  assert.deepEqual(Object.keys(c.services).sort(), ['bob-feeder', 'bob-web'])
  assert.equal(c.services['bob-web'].image, WEB_ID)
  assert.equal(c.services['bob-feeder'].image, FEEDER_ID)
  for (const [name, s] of Object.entries(c.services)) {
    assert.equal(s.container_name, name)
    assert.ok(!s.ports?.length, `${name} publishes a port`)
    assert.ok(s.user && !/^(0|root)(:|$)/.test(s.user), `${name} runs as root`)
    assert.equal(s.read_only, true, `${name} is not read-only`)
    assert.deepEqual(s.cap_drop, ['ALL'])
    assert.ok(s.security_opt?.includes('no-new-privileges:true'))
    const l = s.deploy?.resources?.limits
    assert.ok(l?.cpus && l.memory && l.pids, `${name} has no cpu, memory and pids limits`)
  }
})

test('the web image is required and never a tag fallback', { skip }, () => {
  assert.throws(() => config({ BOB_HOST: 'bob.example.test' }), /BOB_WEB_IMAGEN/)
})

test('secrets only as read-only files from /opt/bob, never in the environment', { skip }, () => {
  for (const [name, s] of Object.entries(full().services)) {
    for (const k of Object.keys(s.environment ?? {})) {
      assert.ok(!(FORBIDDEN_IN_BOX as readonly string[]).includes(k), `${name} has ${k} in its environment`)
    }
    for (const v of s.volumes ?? []) {
      assert.equal(v.type, 'bind')
      assert.equal(v.read_only, true, `${name} mounts ${v.source} writable`)
      assert.match(v.source, /^\/opt\/bob\/(secrets|config)\//, `${name} mounts ${v.source}`)
    }
  }
})

test('networks: the neighbour network for both, the edge only for the app', { skip }, () => {
  const c = full()
  const names = (s: Service) => Object.keys(s.networks ?? {}).map((k) => c.networks[k].name).sort()
  assert.deepEqual(names(c.services['bob-web']), ['bzzz-edge', 'bzzz-vecina-bob'])
  assert.deepEqual(names(c.services['bob-feeder']), ['bzzz-vecina-bob'])
  for (const n of Object.values(c.networks)) assert.equal(n.external, true)
})

test('every router puts the box gate first; the feeder has no route', { skip }, () => {
  const { services } = full()
  const web = services['bob-web'].labels ?? {}
  const mws = Object.entries(web).filter(([k]) => /^traefik\.http\.routers\.[^.]+\.middlewares$/.test(k))
  assert.ok(mws.length >= 2)
  for (const [k, v] of mws) assert.match(v, /^puerta-apps@file,/, `${k} does not start with the gate`)
  assert.equal(web['traefik.docker.network'], 'bzzz-edge')
  const feeder = services['bob-feeder']
  assert.ok(!Object.keys(feeder.labels ?? {}).some((k) => k.startsWith('traefik.')))
  assert.deepEqual(feeder.profiles, ['feeder'])
})
