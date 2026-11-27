// What deploy.sh accepts in /opt/bob/secrets (deploy/caja/lib.sh, comprobar_raiz_y_secretos and exigir_secretos).
//
// Runs the real shell functions against a throwaway BOB_RAIZ with the bench's marker (fijos.sh: BOB_BANCO=1, no
// /opt/bzzz, a marker file of this user outside /opt). In the bench the owner of every secret is whoever runs it, so
// ownership is not exercised here; deploy/caja/banco/banco.sh runs it as root on a real layout.
//
// The case that matters: Bzzz's scripts/cert-vecina.sh leaves the feeder's mTLS material as a DIRECTORY,
// secrets/vecinos/{cliente.crt,ca.crt} at 644 and cliente.key at 600. That must not stop the web deploy, and nothing
// else may ride in with it.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, linkSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const CAJA = new URL('../../deploy/caja/', import.meta.url).pathname
const skip = existsSync('/opt/bzzz') ? '/opt/bzzz exists: this is a box, the bench guard refuses to run' : false

type Run = { rc: number | null; out: string }

function bench(): { raiz: string; run: (componente?: 'web' | 'feeder') => Run; done: () => void } {
  const dir = realpathSync(mkdtempSync(join(tmpdir(), 'bobcaja-secretos-')))
  const raiz = join(dir, 'bob')
  const marca = join(dir, 'marca')
  writeFileSync(marca, `banco-bobcaja ${dir}`)
  mkdirSync(join(raiz, 'secrets'), { recursive: true, mode: 0o700 })
  chmodSync(raiz, 0o755)
  chmodSync(join(raiz, 'secrets'), 0o700)
  for (const f of ['app.env', 'migrador.env']) {
    writeFileSync(join(raiz, 'secrets', f), 'X=1\n', { mode: 0o600 })
  }
  const run = (componente: 'web' | 'feeder' = 'web'): Run => {
    const r = spawnSync('bash', ['-c',
      '. "$1/lib.sh" && componente "$2" && exigir_secretos && comprobar_raiz_y_secretos && echo aceptado', '_',
      CAJA, componente], {
      env: {
        PATH: process.env.PATH ?? '', BOB_BANCO: '1', BOB_BANCO_MARCA: marca, BOB_RAIZ: raiz,
        BOB_COMPROBAR_ATESTACION: join(dir, 'no-hay'), BOB_FIRMANTES: join(dir, 'no-hay'),
      } as unknown as NodeJS.ProcessEnv,
      encoding: 'utf8',
    })
    return { rc: r.status, out: (r.stdout + r.stderr).trim() }
  }
  return { raiz, run, done: () => rmSync(dir, { recursive: true, force: true }) }
}

// Exactly what cert-vecina.sh --emitir bob leaves (entregar(): mkdir + chmod 700, install -m 644/600).
function asCertVecinaLeavesIt(raiz: string) {
  const v = join(raiz, 'secrets', 'vecinos')
  mkdirSync(v)
  chmodSync(v, 0o700)
  writeFileSync(join(v, 'cliente.crt'), '-----BEGIN CERTIFICATE-----\nfalso\n-----END CERTIFICATE-----\n', { mode: 0o644 })
  writeFileSync(join(v, 'ca.crt'), '-----BEGIN CERTIFICATE-----\nfalso\n-----END CERTIFICATE-----\n', { mode: 0o644 })
  writeFileSync(join(v, 'cliente.key'), '-----BEGIN PRIVATE KEY-----\nfalso\n-----END PRIVATE KEY-----\n', { mode: 0o600 })
  chmodSync(join(v, 'cliente.crt'), 0o644)
  chmodSync(join(v, 'ca.crt'), 0o644)
  chmodSync(join(v, 'cliente.key'), 0o600)
  return v
}

function expectAccepted(r: Run, what: string) {
  assert.equal(r.rc, 0, `${what}: expected accepted, got rc ${r.rc}: ${r.out}`)
  assert.match(r.out, /aceptado$/)
}
function expectRefused(r: Run, cause: RegExp, what: string) {
  assert.equal(r.rc, 2, `${what}: expected no-empieza (rc 2), got rc ${r.rc}: ${r.out}`)
  assert.match(r.out, /^no-empieza: /m)
  assert.match(r.out, cause, `${what}: refused for another reason: ${r.out}`)
}

test('without vecinos/ the web deploy is accepted, as today', { skip }, () => {
  const b = bench()
  try { expectAccepted(b.run('web'), 'app.env and migrador.env only') } finally { b.done() }
})

test('the directory cert-vecina.sh leaves does not stop the web deploy', { skip }, () => {
  const b = bench()
  try {
    asCertVecinaLeavesIt(b.raiz)
    expectAccepted(b.run('web'), 'secrets/vecinos as cert-vecina.sh leaves it')
  } finally { b.done() }
})

test('the feeder needs feeder.env and the three files of vecinos/', { skip }, () => {
  const b = bench()
  try {
    expectRefused(b.run('feeder'), /falta .*secrets\/feeder\.env/, 'feeder without feeder.env')
    writeFileSync(join(b.raiz, 'secrets', 'feeder.env'), 'X=1\n', { mode: 0o600 })
    expectRefused(b.run('feeder'), /falta .*secrets\/vecinos\/cliente\.crt .*cert-vecina\.sh/, 'feeder without vecinos/')
    const v = asCertVecinaLeavesIt(b.raiz)
    expectAccepted(b.run('feeder'), 'feeder with everything')
    rmSync(join(v, 'cliente.key'))
    expectRefused(b.run('feeder'), /falta .*secrets\/vecinos\/cliente\.key/, 'feeder without its key (--desde-csr leaves none)')
    expectAccepted(b.run('web'), 'web with vecinos/ but no key yet')
  } finally { b.done() }
})

test('the key stays strict: 600 or 400', { skip }, () => {
  const b = bench()
  try {
    const v = asCertVecinaLeavesIt(b.raiz)
    for (const m of [0o644, 0o640, 0o660, 0o700]) {
      chmodSync(join(v, 'cliente.key'), m)
      expectRefused(b.run('web'), new RegExp(`secrets/vecinos/cliente\\.key tiene permisos ${m.toString(8)}`), `key at ${m.toString(8)}`)
    }
    chmodSync(join(v, 'cliente.key'), 0o400)
    expectAccepted(b.run('web'), 'key at 400')
  } finally { b.done() }
})

test('the certificates: 644, 444, 600 or 400, never writable or executable', { skip }, () => {
  const b = bench()
  try {
    const v = asCertVecinaLeavesIt(b.raiz)
    for (const m of [0o664, 0o666, 0o755]) {
      chmodSync(join(v, 'ca.crt'), m)
      expectRefused(b.run('web'), new RegExp(`secrets/vecinos/ca\\.crt tiene permisos ${m.toString(8)}`), `ca.crt at ${m.toString(8)}`)
    }
  } finally { b.done() }
})

test('nothing else rides in vecinos/: other names, links, hard links, subdirectories', { skip }, () => {
  const cases: [string, (v: string, raiz: string) => void, RegExp][] = [
    ['an extra file', (v) => writeFileSync(join(v, 'otra.key'), 'x', { mode: 0o600 }),
      /secrets\/vecinos\/otra\.key no se espera/],
    ['a hidden file', (v) => writeFileSync(join(v, '..x'), 'x', { mode: 0o600 }),
      /secrets\/vecinos\/\.\.x no se espera/],
    ['the key as a symlink', (v) => { rmSync(join(v, 'cliente.key')); symlinkSync('../app.env', join(v, 'cliente.key')) },
      /secrets\/vecinos\/cliente\.key no es un fichero normal/],
    ['the key as a hard link to another secret', (v, raiz) => { rmSync(join(v, 'cliente.key')); linkSync(join(raiz, 'secrets', 'app.env'), join(v, 'cliente.key')) },
      /secrets\/vecinos\/cliente\.key tiene 2 enlaces/],
    ['a directory named like a file', (v) => { rmSync(join(v, 'ca.crt')); mkdirSync(join(v, 'ca.crt')) },
      /secrets\/vecinos\/ca\.crt no es un fichero normal/],
    ['a subdirectory', (v) => mkdirSync(join(v, 'mas')), /secrets\/vecinos\/mas no se espera/],
  ]
  for (const [what, make, cause] of cases) {
    const b = bench()
    try {
      make(asCertVecinaLeavesIt(b.raiz), b.raiz)
      expectRefused(b.run('web'), cause, what)
    } finally { b.done() }
  }
})

test('vecinos/ itself: a real directory at 700 or 500, and the only directory', { skip }, () => {
  {
    const b = bench()
    try {
      const v = asCertVecinaLeavesIt(b.raiz)
      for (const m of [0o755, 0o750, 0o711]) {
        chmodSync(v, m)
        expectRefused(b.run('web'), new RegExp(`secrets/vecinos tiene permisos ${m.toString(8)}`), `vecinos/ at ${m.toString(8)}`)
      }
      chmodSync(v, 0o500)
      expectAccepted(b.run('web'), 'vecinos/ at 500')
      chmodSync(v, 0o700)
    } finally { b.done() }
  }
  {
    const b = bench()
    try {
      const real = join(b.raiz, 'fuera')
      mkdirSync(real, { mode: 0o700 })
      symlinkSync(real, join(b.raiz, 'secrets', 'vecinos'))
      expectRefused(b.run('web'), /secrets\/vecinos no es un fichero normal/, 'vecinos as a symlink to a directory')
    } finally { b.done() }
  }
  {
    const b = bench()
    try {
      mkdirSync(join(b.raiz, 'secrets', 'raro'))
      expectRefused(b.run('web'), /secrets\/raro no es un fichero normal/, 'any other directory')
      rmSync(join(b.raiz, 'secrets', 'raro'), { recursive: true })
      mkdirSync(join(b.raiz, 'secrets', 'Vecinos'))
      expectRefused(b.run('web'), /secrets\/Vecinos no es un fichero normal/, 'a look-alike name')
    } finally { b.done() }
  }
})
