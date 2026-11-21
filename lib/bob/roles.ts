// The account's role inside BOb, read from bob.users as bob_app.
//
// Henry, 2026-11-21 («Sin fila, 403»): an account with no row, or with a row
// whose `active` is not true, has no role, and the box answers 403 on
// /bob/*, /api/bob/* and /api/config/*. There is no viewer fallback.
//
// The roles BOb serves are admin, analyst and viewer; `service` and `demo`
// rows are no role in the box either. bob_app reads only its own
// organization's users (BOb-engine #34, which closed P-1).
import type { Pool } from 'pg'
import { asBobApp } from './db.ts'

export const ROLES = ['admin', 'analyst', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export async function boxRole(orgId: string, userId: string, source?: Pool): Promise<Role | null> {
  const row = await asBobApp(orgId, async (db) => (await db.query(
    'SELECT role FROM bob.users WHERE id = $1 AND active IS TRUE', [userId])).rows[0], source)
  return (ROLES as readonly string[]).includes(row?.role) ? (row.role as Role) : null
}
