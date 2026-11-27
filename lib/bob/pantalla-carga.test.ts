// BOb's loading screen (app/_carga) is Hivemonic's: the portal's black and
// amber, Boss Technology's logo, no client brand. It loads nothing from another
// origin (the box's CSP, security-headers.ts), and /entrar and the /bob screens
// use it. /entrar's handover itself is portal.test.ts's and box-proxy.test.ts's.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const css = readFileSync('app/_carga/pantalla.module.css', 'utf8')
const tsx = readFileSync('app/_carga/pantalla.tsx', 'utf8')
const entrar = readFileSync('app/entrar/handover.tsx', 'utf8')
const loading = readFileSync('app/bob/loading.tsx', 'utf8')

test('the loading screen has the colours of Hivemonic\'s (Bzzz marca.css)', () => {
  for (const [name, value] of [['tinta', '#000000'], ['ambar', '#ffb020'], ['hueso', '#e8e4dc'], ['gris', '#8b8780']]) {
    assert.match(css, new RegExp(`--bz-${name}: ${value};`), name)
  }
  assert.match(css, /\.barra::before[^}]*animation: llenar 2s infinite/)
})

test('nothing on it comes from another origin', () => {
  for (const [file, text] of [['css', css], ['tsx', tsx]]) {
    assert.doesNotMatch(text, /https?:\/\//, file)
    assert.doesNotMatch(text, /@import|@font-face/, file)
  }
  assert.doesNotMatch(css, /url\(/)
  assert.match(tsx, /import boss from '\.\/boss\.png'/)
})

test('it shows Boss Technology and no client', () => {
  assert.match(tsx, /alt="Boss Technology"/)
  assert.doesNotMatch(tsx + css, /cliente|febor/i)
})

test('/entrar and the /bob screens use it', () => {
  assert.match(entrar, /<PantallaCarga lema="Entrando en BOb…" \/>/)
  assert.match(entrar, /<PantallaCarga mensaje=\{message\} enlace=\{\{ href: portal,/)
  assert.match(loading, /<PantallaCarga lema=/)
})

test('/entrar still hands over exactly as before: fragment, post, replace, show', () => {
  assert.match(entrar, /hash: window\.location\.hash,/)
  assert.match(entrar, /clearHash: \(\) => window\.history\.replaceState\(null, '', window\.location\.pathname\),/)
  assert.match(entrar, /post: \(url, init\) => fetch\(url, init\),/)
  assert.match(entrar, /replace: \(url\) => window\.location\.replace\(url\),/)
  assert.match(entrar, /show: setMessage,/)
})
