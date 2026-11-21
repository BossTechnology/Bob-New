// The hook for Slice 3 (BOb-engine, docs/slice-3-absent-not-zero.md §7).
//
// The cell states (not_applicable, not_configured, pending, not_observed,
// observed, off_shift) and their reasons are resolved in the database, in
// bob.v_cell_state, as one implementation for every consumer. "No rule lives
// in TypeScript": this app only paints them. The view does not exist yet, so
// the screens keep painting what they read (no row, a written zero, a value)
// and say that the states are pending.
//
// When the view lands, the readers select from it here, under the same
// bob_app transaction, and the screens map state -> painting and
// reason -> sentence. Nothing in matrix.ts or screens.ts grows a rule.
import type { PoolClient } from 'pg'

export async function hasCellStateView(db: PoolClient): Promise<boolean> {
  const { rows } = await db.query("SELECT to_regclass('bob.v_cell_state') IS NOT NULL AS present")
  return rows[0]?.present === true
}
