// The account's role inside BOb, read from bob.users as bob_app.
//
// P-1 (inventario): bob.users has a policy for `authenticated` only, so under
// bob_app no row is visible and every account reads as `viewer`. That fails
// closed: it reads, it does not write. Lifting it is BOb-engine's (a policy on
// bob.users for bob_app) or Henry's (P-5 of the Bzzz inputs), not this app's.
import type { Pool } from 'pg'
import { asBobApp } from './db.ts'

export const ROLES = ['admin', 'analyst', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export async function boxRole(orgId: string, userId: string, source?: Pool): Promise<Role> {
  const row = await asBobApp(orgId, async (db) => (await db.query(
    'SELECT role FROM bob.users WHERE id = $1 AND active IS NOT FALSE', [userId])).rows[0], source)
  return (ROLES as readonly string[]).includes(row?.role) ? (row.role as Role) : 'viewer'
}

