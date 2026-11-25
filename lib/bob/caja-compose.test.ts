// The compose that runs BOb next to the box (deploy/caja/compose.yml, Bzzz D77).
//
// Reads what `docker compose config` resolves, not the YAML text, so an anchor,
// a default or a profile cannot hide a published port or a secret in the
// environment. Needs docker: in CI (CI=true) a missing docker fails; on a
// laptop without it the test is skipped and says so.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
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

// Every router the labels name, not only the ones that already have a
// middlewares label: a router without one would skip the gate.
export function gateProblems(raw: Record<string, string>): string[] {
  const out: string[] = []
  // Traefik reads label keys case-insensitively, so compare them lower-cased.
  const labels = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.toLowerCase(), v]))
  for (const k of Object.keys(labels)) {
    if (/^traefik\.(tcp|udp)\./.test(k)) out.push(`${k}: BOb only enters over HTTP behind the gate`)
  }
  const routers = new Set(Object.keys(labels).flatMap((k) => k.match(/^traefik\.http\.routers\.([^.]+)\./)?.[1] ?? []))
  for (const r of routers) {
    const mw = (labels[`traefik.http.routers.${r}.middlewares`] ?? '').split(',').map((x) => x.trim()).filter(Boolean)
    if (mw[0]?.toLowerCase() !== 'puerta-apps@file') out.push(`router ${r} does not start with puerta-apps@file (${mw.join(',') || 'no middlewares'})`)
  }
  return out
}

test('gateProblems catches a router without middlewares and tcp/udp routes', () => {
  const ok = { 'traefik.http.routers.a.rule': 'Host(`x`)', 'traefik.http.routers.a.middlewares': 'puerta-apps@file,cabeceras@file' }
  assert.deepEqual(gateProblems(ok), [])
  assert.equal(gateProblems({ ...ok, 'traefik.http.routers.b.rule': 'Host(`x`) && PathPrefix(`/api`)' }).length, 1)
  assert.equal(gateProblems({ ...ok, 'traefik.http.routers.a.middlewares': 'cabeceras@file,puerta-apps@file' }).length, 1)
  assert.equal(gateProblems({ ...ok, 'traefik.tcp.routers.t.rule': 'HostSNI(`*`)' }).length, 1)
  assert.equal(gateProblems({ ...ok, 'traefik.udp.routers.u.entrypoints': 'x' }).length, 1)
  // Traefik reads label keys case-insensitively: an upper-case router is still a router.
  assert.equal(gateProblems({ ...ok, 'Traefik.HTTP.Routers.B.Rule': 'Host(`x`)' }).length, 1)
  assert.equal(gateProblems({ ...ok, 'TRAEFIK.TCP.routers.t.rule': 'HostSNI(`*`)' }).length, 1)
  assert.deepEqual(gateProblems({ 'traefik.http.routers.C.rule': 'Host(`x`)', 'Traefik.Http.Routers.c.Middlewares': 'puerta-apps@file' }), [])
})

test('every router puts the box gate first; the feeder has no route', { skip }, () => {
  const { services } = full()
  const web = services['bob-web'].labels ?? {}
  assert.ok(Object.keys(web).some((k) => k.startsWith('traefik.http.routers.')))
  assert.deepEqual(gateProblems(web), [])
  assert.equal(web['traefik.docker.network'], 'bzzz-edge')
  const feeder = services['bob-feeder']
  assert.ok(!Object.keys(feeder.labels ?? {}).some((k) => k.startsWith('traefik.')))
  assert.deepEqual(feeder.profiles, ['feeder'])
})

test('the isolation check forbids exactly FORBIDDEN_IN_BOX', () => {
  const script = readFileSync(new URL('../../deploy/caja/comprobar-aislamiento.sh', import.meta.url), 'utf8')
  const block = script.split('# --- FORBIDDEN_IN_BOX ---')[1]?.split('# --- fin ---')[0] ?? ''
  const names = [...block.matchAll(/"([A-Z0-9_]+)"/g)].map((m) => m[1])
  assert.deepEqual(names, [...FORBIDDEN_IN_BOX])
})
