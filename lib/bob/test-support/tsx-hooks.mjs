// Module hooks that let `node --test` render the /bob views (.tsx) with
// react-dom/server: '@/' resolves to the repo root, imports without an
// extension find .tsx or .ts, .tsx is compiled with the TypeScript already in
// devDependencies, a CSS module is its class names, and next/link is an <a>.
// Tests only; the app is built by Next.
import { readFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'

const root = new URL('../../../', import.meta.url)
// A URL inside the repo, so the stub's own import of react resolves.
const LINK = new URL('lib/bob/test-support/next-link.stub.mjs', root).href

export async function resolve(specifier, context, next) {
  if (specifier === 'next/link') return { url: LINK, shortCircuit: true }
  let spec = specifier
  if (spec.startsWith('@/')) spec = new URL(spec.slice(2), root).href
  const local = spec.startsWith('.') || spec.startsWith('file:')
  if (local && !/\.(tsx?|mjs|js|css|json)$/.test(spec)) {
    for (const ext of ['.tsx', '.ts']) {
      const url = new URL(spec + ext, context.parentURL)
      if (existsSync(fileURLToPath(url))) return { url: url.href, shortCircuit: true }
    }
  }
  if (spec.endsWith('.css')) return { url: new URL(spec, context.parentURL).href, shortCircuit: true }
  return next(spec, context)
}

export async function load(url, context, next) {
  if (url === LINK) {
    return {
      format: 'module', shortCircuit: true,
      source: `import { createElement } from 'react'
export default function Link({ href, children, ...rest }) { return createElement('a', { href, ...rest }, children) }`,
    }
  }
  if (url.endsWith('.css')) {
    return {
      format: 'module', shortCircuit: true,
      source: 'export default new Proxy({}, { get: (_, k) => String(k) })',
    }
  }
  if (url.endsWith('.tsx')) {
    const source = await readFile(fileURLToPath(url), 'utf8')
    const out = ts.transpileModule(source, {
      fileName: fileURLToPath(url),
      compilerOptions: { jsx: ts.JsxEmit.ReactJSX, module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    })
    return { format: 'module', shortCircuit: true, source: out.outputText }
  }
  return next(url, context)
}

