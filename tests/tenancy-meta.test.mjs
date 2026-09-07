// ID-12 — a tenancy failure is a build-blocking defect, not a bug.
//
// Two halves. The workflow makes the suite blocking; this file proves the suite
// can go red. A green suite that cannot go red is not a suite, and a
// build-blocking check that always passes blocks nothing.
//
// Every case creates its defect inside a transaction and rolls back, so the
// suite never leaves a broken table behind for a later test to trip over.

import { test, before, after, describe } from 'node:test'
import assert from 'node:assert/strict'
import { connect } from './helpers/db.mjs'
import { structuralFindings, projectionGrantFindings } from './helpers/rls.mjs'

let db

before(async () => { db = await connect() })
after(async () => { await db?.end() })

describe('ID-12 · the tenancy suite detects what it claims to detect', () => {
  test('a table with org_id and no RLS is reported', async () => {
    await db.query('BEGIN')
    try {
      await db.query(`
        CREATE TABLE public.meta_probe_no_rls (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL)`)

      const findings = await structuralFindings(db)
      const hit = findings.find((f) => f.table === 'meta_probe_no_rls')

      assert.ok(hit, 'a table carrying org_id without RLS went unreported')
      assert.match(hit.finding, /row-level security is not enabled/)
    } finally {
      await db.query('ROLLBACK')
    }
  })

  test('a table with RLS but no policy is reported', async () => {
    await db.query('BEGIN')
    try {
      await db.query(`
        CREATE TABLE public.meta_probe_no_policy (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL);
        ALTER TABLE public.meta_probe_no_policy ENABLE ROW LEVEL SECURITY;`)

      const findings = await structuralFindings(db)
      assert.ok(
        findings.some((f) => f.table === 'meta_probe_no_policy'),
        'RLS enabled with no policy went unreported',
      )
    } finally {
      await db.query('ROLLBACK')
    }
  })

  // The subtle one. RLS on, a policy present, and the policy does not actually
  // constrain the tenant — which looks correct in every listing.
  test('a policy that does not constrain org_id is reported', async () => {
    await db.query('BEGIN')
    try {
      await db.query(`
        CREATE TABLE public.meta_probe_open_policy (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          org_id UUID NOT NULL);
        ALTER TABLE public.meta_probe_open_policy ENABLE ROW LEVEL SECURITY;
        CREATE POLICY "wide_open" ON public.meta_probe_open_policy
          FOR ALL TO authenticated USING (true);`)

      const findings = await structuralFindings(db)
      const hit = findings.find((f) => f.table === 'meta_probe_open_policy')

      assert.ok(hit, 'a policy reachable by authenticated that ignores org_id went unreported')
      assert.match(hit.finding, /does not constrain org_id/)
    } finally {
      await db.query('ROLLBACK')
    }
  })

  test('a projection table writable by the application is reported', async () => {
    await db.query('BEGIN')
    try {
      await db.query(`
        CREATE TABLE public.proj_meta_probe (
          org_id UUID NOT NULL,
          bucket_start TIMESTAMPTZ NOT NULL);
        GRANT INSERT ON public.proj_meta_probe TO authenticated;`)

      const findings = await projectionGrantFindings(db)
      assert.ok(
        findings.some((f) => f.table === 'proj_meta_probe'),
        'PR-4 violation on a projection table went unreported',
      )
    } finally {
      await db.query('ROLLBACK')
    }
  })
})
