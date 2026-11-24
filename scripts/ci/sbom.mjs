// CycloneDX SBOM of the production dependencies, from the lockfile, made
// reproducible (ASVS 4.0.3 V14.2.5): npm adds a random serial number and a
// timestamp, and names the root after the folder it runs in. Same lockfile,
// same file.
//
//   node scripts/ci/sbom.mjs > sbom.cdx.json
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export function normalizeSbom(sbom, name) {
  const out = structuredClone(sbom)
  delete out.serialNumber
  out.metadata = { ...out.metadata }
  delete out.metadata.timestamp
  out.metadata.component = { ...out.metadata.component, name }
  return out
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const raw = execFileSync('npm', ['sbom', '--sbom-format', 'cyclonedx', '--omit', 'dev', '--package-lock-only'],
    { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 })
  const { name } = JSON.parse(readFileSync('package.json', 'utf8'))
  process.stdout.write(JSON.stringify(normalizeSbom(JSON.parse(raw), name), null, 2) + '\n')
}
