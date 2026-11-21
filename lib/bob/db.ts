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
//
// Bounded (review of PR #30, point 3): acquiring a client gives up after
// connectionTimeoutMillis, every transaction carries a statement timeout, and
// an idle client that dies (Postgres restarting) is logged instead of
// crashing the process. With max 4 clients, a slow read must not be able to
// hold the pool and hang /api/health.
//
// The login itself must not be able to skip RLS: a pool made by createPool()
// (the app's, getPool()) checks once that session_user is neither a superuser
// nor BYPASSRLS, nor a member of one, and refuses every read if it is. SET
// ROLE proves current_user only; a privileged login could RESET ROLE.
import { Pool, type PoolClient } from 'pg'
import { dbTarget, type DbTarget } from './runtime.ts'

export const STATEMENT_TIMEOUT = '5s'
export const POOL_OPTIONS = { max: 4, connectionTimeoutMillis: 3000, idleTimeoutMillis: 30_000 }

// Not a BobConfigError: those are shown to the user as a 400.
export class PrivilegedLoginError extends Error {}

// Pools whose login must be proven unprivileged, and the proof once it holds.
const guarded = new WeakMap<Pool, Promise<void> | null>()

export function createPool(t: DbTarget): Pool {
  const p = t.kind === 'url'
    ? new Pool({ connectionString: t.connectionString, ...POOL_OPTIONS })
    : new Pool({ host: t.host, port: t.port, database: t.database, user: t.user, password: t.password, ...POOL_OPTIONS })
  p.on('error', (e) => console.error('bob db: idle client failed', e.message))
  guarded.set(p, null)
  return p
}

let pool: Pool | null = null

export function getPool(): Pool {
  if (pool) return pool
  pool = createPool(dbTarget())
  return pool
}

export type Tx = PoolClient

export async function privilegedLogin(db: Tx): Promise<boolean> {
  const { rows } = await db.query(`
    SELECT EXISTS (
      SELECT 1 FROM pg_roles r
       WHERE (r.rolsuper OR r.rolbypassrls) AND pg_has_role(session_user, r.oid, 'MEMBER')
    ) AS privileged`)
  return rows[0]?.privileged === true
}

async function proveLogin(source: Pool, db: Tx): Promise<void> {
  if (!guarded.has(source)) return
  let proof = guarded.get(source)
  if (!proof) {
    proof = privilegedLogin(db).then((p) => {
      if (p) throw new PrivilegedLoginError('el login de BOb es superusuario o BYPASSRLS: BOb no lee con él')
    })
    guarded.set(source, proof)
    // A refused login stays refused; a failed check (connection) is retried.
    proof.catch((e) => { if (!(e instanceof PrivilegedLoginError)) guarded.set(source, null) })
  }
  await proof
}

// At start-up in the box: refuse to start with a privileged login. If the
// database is not reachable yet, start anyway; the first read checks again.
export async function checkLoginAtStartup(source: Pool = getPool()): Promise<void> {
  let db: Tx
  try {
    db = await source.connect()
  } catch (e) {
    console.error('bob db: login not checked at start-up, database unreachable', (e as Error).message)
    return
  }
  try {
    await proveLogin(source, db)
  } finally {
    db.release()
  }
}

export async function asBobApp<T>(
  orgId: string,
  fn: (db: Tx) => Promise<T>,
  source: Pool = getPool(),
  { write = false }: { write?: boolean } = {},
): Promise<T> {
  const db = await source.connect()
  try {
    await proveLogin(source, db)
    await db.query(write ? 'BEGIN' : 'BEGIN READ ONLY')
    await db.query(`SET LOCAL statement_timeout = '${STATEMENT_TIMEOUT}'`)
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
