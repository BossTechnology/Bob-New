// Loads the /bob pages (app/bob/*/page.tsx) under node:test so a test can
// render them with react-dom/server. Test support only: nothing in the app
// imports this file.
//
// Module hooks (node:module registerHooks):
// - .tsx is transpiled by TypeScript (jsx: react-jsx);
// - `@/` is the repository root, and an extensionless relative import tries
//   .tsx then .ts, as Next resolves them;
// - CSS modules export their class names as themselves;
// - next/link is a plain <a>, next/navigation throws;
// - lib/bob/screen-gate.ts answers what the test puts in globalThis.__bobGate,
//   and the three reads of lib/bob/projection-reader.ts answer
//   globalThis.__bobRead; everything else of the reader is the real module.
//   The pages themselves run unchanged.
import { existsSync, readFileSync } from 'node:fs'
import { registerHooks } from 'node:module'
import { fileURLToPath, pathToFileURL } from 'node:url'
import ts from 'typescript'

const ROOT = new URL('../../', import.meta.url)
const STUB = new URL('.render-stub/', ROOT)
const GATE = new URL('lib/bob/screen-gate.ts', ROOT).href
const READER = new URL('lib/bob/projection-reader.ts', ROOT).href

const STUBS: Record<string, string> = {
  'next-link.mjs': `import { createElement } from 'react'
export default function Link({ href, className, children }) { return createElement('a', { href, className }, children) }`,
  'next-navigation.mjs': `export function notFound() { throw new Error('NEXT_NOT_FOUND') }
export function redirect(to) { throw new Error('NEXT_REDIRECT ' + to) }`,
  'screen-gate.mjs': `export async function requireScreen() { return globalThis.__bobGate }`,
  'projection-reader.mjs': `export * from '${READER}?real'
export async function readPerformance() { return globalThis.__bobRead }
export async function readInteractions() { return globalThis.__bobRead }
export async function readQuality() { return globalThis.__bobRead }`,
  'css-module.mjs': `export default new Proxy({}, { get: (_, k) => (typeof k === 'string' ? k : undefined) })`,
}

const stub = (name: string) => ({ url: new URL(name, STUB).href, shortCircuit: true })

let registered = false
export function registerPageHooks() {
  if (registered) return
  registered = true
  registerHooks({
    resolve(specifier, context, next) {
      if (specifier === 'next/link') return stub('next-link.mjs')
      if (specifier === 'next/navigation') return stub('next-navigation.mjs')
      if (specifier.endsWith('.module.css')) return stub('css-module.mjs')
      let spec = specifier
      if (spec.startsWith('@/')) spec = new URL(spec.slice(2), ROOT).href
      const parent = context.parentURL
      if ((spec.startsWith('.') || spec.startsWith('file:')) && parent && !/\.[cm]?[jt]sx?(\?|$)/.test(spec)) {
        for (const ext of ['.tsx', '.ts']) {
          const u = new URL(spec + ext, parent)
          if (existsSync(fileURLToPath(u))) { spec = u.href; break }
        }
      }
      const r = next(spec, context)
      if (r.url === GATE) return stub('screen-gate.mjs')
      if (r.url === READER && !parent?.startsWith(STUB.href)) return stub('projection-reader.mjs')
      return r
    },
    load(url, context, next) {
      if (url.startsWith(STUB.href)) {
        return { format: 'module', source: STUBS[url.slice(STUB.href.length)], shortCircuit: true }
      }
      if (url === `${READER}?real`) return next(READER, context)
      if (url.endsWith('.tsx')) {
        const src = readFileSync(fileURLToPath(url), 'utf8')
        const out = ts.transpileModule(src, {
          fileName: fileURLToPath(url),
          compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
        })
        return { format: 'module', source: out.outputText, shortCircuit: true }
      }
      return next(url, context)
    },
  })
}

export const pageUrl = (screen: string) => pathToFileURL(fileURLToPath(new URL(`app/bob/${screen}/page.tsx`, ROOT))).href
