// The account's role inside BOb, read from bob.users as bob_app.
//
// Henry, 2026-11-21 («Sin fila, 403»): an account with no row, or with a row
// whose `active` is not true, has no role, and the box answers 403 on
// /bob/*, /api/bob/* and /api/config/*. There is no viewer fallback.
//
// Henry, 2026-11-26 («Alta sola, como viewer»), replacing that for an account
// with NO row: whoever holds a live BzzzBX session may enter BOb in the box,
// and the first visit takes a viewer seat in the box's organization
// (bob.claim_viewer_seat, BOb-engine #59: bob_app executes it, it never
// takes a role or an organization from the caller and never touches a row
// that exists). An inactive row, another organization's row, or a GoTrue
// account with no email is still no role. Admin and analyst are still given
// by hand. The account must be the one GoTrue answered for the session
// (session.ts), never a token claim or a header.
//
// The roles BOb serves are admin, analyst and viewer; `service` and `demo`
// rows are no role in the box either. bob_app reads only its own
// organization's users (BOb-engine #34, which closed P-1).
import type { Pool } from 'pg'
import { asBobApp } from './db.ts'
import type { GoTrueUser } from './gotrue.ts'
import { logSecurity } from './security-log.ts'

export const ROLES = ['admin', 'analyst', 'viewer'] as const
export type Role = (typeof ROLES)[number]

export async function boxRole(orgId: string, userId: string, source?: Pool): Promise<Role | null> {
  const row = await asBobApp(orgId, async (db) => (await db.query(
    'SELECT role FROM bob.users WHERE id = $1 AND active IS TRUE', [userId])).rows[0], source)
  return (ROLES as readonly string[]).includes(row?.role) ? (row.role as Role) : null
}

// The role, or on a first visit a viewer seat. One write transaction, so the
// seat and the read that follows it agree.
//
// A seat refused with no row for the id in this organization (another
// organization's row, or an email another account holds) is logged: nobody
// can see that from the 403 alone (review of BOb-engine #59).
export async function boxRoleOrSeat(
  orgId: string, user: GoTrueUser, source?: Pool, log: typeof logSecurity = logSecurity,
): Promise<Role | null> {
  const known = await boxRole(orgId, user.id, source)
  if (known || !user.email) return known
  const { took, row } = await asBobApp(orgId, async (db) => {
    const took = (await db.query('SELECT bob.claim_viewer_seat($1, $2) AS took', [user.id, user.email])).rows[0]?.took === true
    const row = (await db.query('SELECT role, active FROM bob.users WHERE id = $1', [user.id])).rows[0]
    return { took, row }
  }, source, { write: true })
  if (took) log('access.seat_taken', { user: user.id })
  else if (!row) log('access.seat_refused', { user: user.id })
  return row?.active === true && (ROLES as readonly string[]).includes(row.role) ? (row.role as Role) : null
}
