// Structural tenancy checks, written as functions that RETURN findings rather
// than assert inline.
//
// That shape is deliberate: ID-12 requires the suite to be build-blocking, and
// the only honest way to show a suite blocks is to prove it can go red. The
// meta-test creates a deliberately broken table, calls these same functions,
// and asserts they report it. A green suite that cannot go red is not a suite.

import { tenantTables } from './db.mjs'

// Tables where RLS is enabled with NO policy on purpose — deny-all, server-side
// only, service role bypasses. Stated intent, not oversight. Anything else with
// zero policies is a finding.
export const DELIBERATE_DENY_ALL = new Set(['baselines'])

// Roles whose policies must be tenant-scoped. supabase_auth_admin holds
// USING (true) policies so that token issuance can read users and
// organizations; that is legitimate and is not a tenancy hole, because the role
// is not reachable from the API.
const PUBLIC_FACING = new Set(['public', 'anon', 'authenticated'])

export async function structuralFindings(client) {
  const findings = []
  const tables = await tenantTables(client)

  // roles comes back as name[]; cast so the driver parses it as an array
  // rather than handing back the literal '{authenticated}'.
  const { rows: policies } = await client.query(`
    SELECT tablename, policyname, roles::text[] AS roles, cmd, qual, with_check
      FROM pg_policies WHERE schemaname = 'public'`)

  for (const t of tables) {
    if (!t.rls_enabled) {
      findings.push({
        table: t.table_name,
        rule: 'ID-10',
        finding: 'carries org_id but row-level security is not enabled',
      })
      continue
    }

    if (t.policy_count === 0 && !DELIBERATE_DENY_ALL.has(t.table_name)) {
      findings.push({
        table: t.table_name,
        rule: 'ID-10',
        finding:
          'row-level security is enabled with no policy. Deny-all may be ' +
          'correct — if so, add it to DELIBERATE_DENY_ALL so the intent is ' +
          'stated rather than inferred',
      })
    }

    for (const p of policies.filter((p) => p.tablename === t.table_name)) {
      const roles = (p.roles || []).map(String)
      if (!roles.some((r) => PUBLIC_FACING.has(r))) continue

      const expressions = [p.qual, p.with_check].filter(Boolean).join(' ')
      if (!expressions.includes('org_id')) {
        findings.push({
          table: t.table_name,
          rule: 'ID-10',
          finding:
            `policy "${p.policyname}" is reachable by ${roles.join(', ')} ` +
            'but its expression does not constrain org_id',
        })
      }
    }
  }

  return findings
}

// PR-4, asserted rather than assumed. Vacuous until Slice 2 creates the eight
// projection tables, and load-bearing from the moment it does not.
export async function projectionGrantFindings(client) {
  const { rows } = await client.query(`
    SELECT c.relname AS table_name, g.grantee, g.privilege_type
      FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      LEFT JOIN information_schema.role_table_grants g
             ON g.table_schema = 'public'
            AND g.table_name = c.relname
            AND g.privilege_type IN ('INSERT','UPDATE','DELETE','TRUNCATE')
            AND g.grantee IN ('anon','authenticated','bob_app')
     WHERE n.nspname = 'public'
       AND c.relkind IN ('r','p')
       AND c.relname LIKE 'proj\\_%'`)

  return rows
    .filter((r) => r.grantee)
    .map((r) => ({
      table: r.table_name,
      rule: 'PR-4',
      finding:
        `${r.grantee} holds ${r.privilege_type} on a projection table. BOb ` +
        'never writes a projection. Pass the table through ' +
        'bob_grant_projection() in its creating migration',
    }))
}
