// ID-10, second layer — the service-role paths.
//
// The policy tests in tenancy.test.mjs prove the policies are right. They prove
// nothing about a route that runs as the service role, because the service role
// bypasses RLS. ID-10 says NO query path returns another tenant's rows, so the
// service-role paths need their own treatment (D-24 / Q6, ruled: yes).
//
// WHAT THIS IS, STATED PLAINLY. It is an inventory with a required disposition,
// not an execution test. A true end-to-end assertion needs the application
// running against a live Supabase, which waits on N-04. What this does give:
// every service-role route is reviewed, its scoping is written down, and a new
// unguarded route cannot appear without someone making a decision about it.
// That is weaker than executing the route and stronger than nothing, and the
// difference is recorded rather than papered over.

import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { REPO_ROOT } from './helpers/db.mjs'

const ALLOWLIST = JSON.parse(
  readFileSync(join(REPO_ROOT, 'tests/service-role-allowlist.json'), 'utf8'),
).routes

const VALID_SCOPING = new Set(['jwt', 'iterated', 'caller', 'none'])
const VALID_DISPOSITION = new Set(['ok', 'finding', 'superseded'])

function routeFiles(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    if (statSync(full).isDirectory()) routeFiles(full, out)
    else if (entry === 'route.ts') out.push(full)
  }
  return out
}

function serviceRoleRoutes() {
  return routeFiles(join(REPO_ROOT, 'app'))
    .filter((f) => /getServiceClient|getSupabase/.test(readFileSync(f, 'utf8')))
    .map((f) => relative(REPO_ROOT, f))
    .sort()
}

describe('ID-10 · the service-role surface is inventoried, not assumed', () => {
  test('every service-role route is listed with a reason', () => {
    const undeclared = serviceRoleRoutes().filter((r) => !ALLOWLIST[r])
    assert.deepEqual(
      undeclared, [],
      'these routes bypass RLS and have no recorded tenancy decision:\n  ' +
        undeclared.join('\n  ') +
        '\n\nAdd each to tests/service-role-allowlist.json with its scoping ' +
        'and disposition, or stop using the service role there.',
    )
  })

  test('the allowlist names no route that has been removed', () => {
    const live = new Set(serviceRoleRoutes())
    const stale = Object.keys(ALLOWLIST).filter((r) => !live.has(r))
    assert.deepEqual(
      stale, [],
      'the allowlist grants an exemption to routes that no longer reach for ' +
        'the service role:\n  ' + stale.join('\n  '),
    )
  })

  test('every entry carries a valid scoping and disposition', () => {
    const bad = []
    for (const [route, e] of Object.entries(ALLOWLIST)) {
      if (!VALID_SCOPING.has(e.scoping)) bad.push(`${route}: scoping "${e.scoping}"`)
      if (!VALID_DISPOSITION.has(e.disposition)) bad.push(`${route}: disposition "${e.disposition}"`)
      if (!e.reason || e.reason.length < 20) bad.push(`${route}: reason is not a reason`)
    }
    assert.deepEqual(bad, [], bad.join('\n  '))
  })

  // A caller-asserted tenant is a finding by definition: the boundary is
  // whatever the request says it is. It may be an accepted risk, but it must
  // never be filed as "ok".
  test('no caller-asserted tenant is filed as reviewed and correct', () => {
    const mislabelled = Object.entries(ALLOWLIST)
      .filter(([, e]) => e.scoping === 'caller' && e.disposition === 'ok')
      .map(([r]) => r)
    assert.deepEqual(
      mislabelled, [],
      'a route where the caller names the tenant cannot be "ok":\n  ' +
        mislabelled.join('\n  '),
    )
  })
})
