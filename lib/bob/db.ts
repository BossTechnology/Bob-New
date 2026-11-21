// The one way BOb-web reaches Postgres: directly, as bob_app, under the claim
// of one org_id (P5 §3.3, N-04). No PostgREST, no service role.
//
// Every read or write runs in one transaction that switches to bob_app and
// sets request.jwt.claims, so the tenant policy
// (org_id = (auth.jwt() ->> 'org_id')::uuid) applies to every row touched. If
// the role switch does not hold, nothing runs.
//
// In the box the login is bob_app's own (its credential file, runtime.ts), so
// SET ROLE is a no-op that still proves the role. Locally the stack's postgres
// is granted bob_app, as BOb-engine's suite does.
import { Pool, type PoolClient } from 'pg'
import { dbTarget } from './runtime.ts'

let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool
  const t = dbTarget()
  pool = t.kind === 'url'
    ? new Pool({ connectionString: t.connectionString, max: 4 })
    : new Pool({ host: t.host, port: t.port, database: t.database, user: t.user, password: t.password, max: 4 })
  return pool
}

export type Tx = PoolClient

export async function asBobApp<T>(
  orgId: string,
  fn: (db: Tx) => Promise<T>,
  source: Pool = getPool(),
  { write = false }: { write?: boolean } = {},
): Promise<T> {
  const db = await source.connect()
  try {
    await db.query(write ? 'BEGIN' : 'BEGIN READ ONLY')
    await db.query('SET LOCAL ROLE bob_app')
    await db.query("SELECT set_config('request.jwt.claims', $1, true)",
      [JSON.stringify({ org_id: orgId, role: 'bob_app' })])
    const { rows } = await db.query('SELECT current_user AS u')
    if (rows[0]?.u !== 'bob_app') throw new Error(`lectura como ${rows[0]?.u}, no como bob_app`)
    const out = await fn(db)
    await db.query('COMMIT')
    return out
  } catch (e) {
    await db.query('ROLLBACK').catch(() => {})
    throw e
  } finally {
    db.release()
  }
}
