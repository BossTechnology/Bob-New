// The SBOM kept with each CI run (ASVS 4.0.3 V14.2.5) is the same for the
// same lockfile: no random serial, no timestamp, and the package's own name
// rather than the name of the folder it was built in.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { normalizeSbom } from '../../scripts/ci/sbom.mjs'

const raw = (serial: string, at: string, dir: string) => ({
  bomFormat: 'CycloneDX', specVersion: '1.5', serialNumber: `urn:uuid:${serial}`, version: 1,
  metadata: { timestamp: at, tools: [{ vendor: 'npm', name: 'cli', version: '10.9.4' }],
    component: { 'bom-ref': 'bob-web@0.1.0', type: 'library', name: dir, version: '0.1.0', purl: 'pkg:npm/bob-web@0.1.0' } },
  components: [{ name: 'pg', version: '8.23.1' }],
})

test('two builds of the same lockfile give the same SBOM', () => {
  const a = normalizeSbom(raw('1111', '2026-01-01T00:00:00Z', 'angry-mahavira-5e60dd'), 'bob-web')
  const b = normalizeSbom(raw('2222', '2026-02-02T00:00:00Z', 'runner-work-dir'), 'bob-web')
  assert.deepEqual(a, b)
  assert.equal('serialNumber' in a, false)
  assert.equal('timestamp' in a.metadata, false)
  assert.equal(a.metadata.component.name, 'bob-web')
  assert.deepEqual(a.components, [{ name: 'pg', version: '8.23.1' }])
})
