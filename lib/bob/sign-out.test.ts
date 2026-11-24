// Signing out of the box (ASVS 4.0.3 V3.3.1, V8.2.3): the session ends at
// GoTrue and the page that showed bob's figures is replaced, not kept.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { signOut } from './sign-out.ts'

test('signing out ends the session, then replaces the page with /login', async () => {
  const steps: string[] = []
  await signOut(async (url, init) => { steps.push(`${init?.method} ${url}`); return new Response('{}') },
    (url) => { steps.push(`replace ${url}`) })
  assert.deepEqual(steps, ['POST /auth/logout', 'replace /login'])
})

test('the page goes even when the request fails', async () => {
  const steps: string[] = []
  await signOut(async () => { throw new TypeError('fetch failed') }, (url) => { steps.push(url) })
  assert.deepEqual(steps, ['/login'])
})

test('every box screen offers it', () => {
  const parts = readFileSync('app/bob/screen-parts.tsx', 'utf8')
  assert.match(parts, /export function ScreenNav[\s\S]*<SignOut \/>/)
  const live = readFileSync('public/bob-live.mjs', 'utf8')
  assert.match(live, /function enableSignOut\(\)/)
  assert.match(live, /enableThresholds\(\)\s*\n\s*enableSignOut\(\)/)
})
