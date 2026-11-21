// The container's healthcheck in the box (insumos de Bzzz §4.2, punto 10): a
// SELECT as bob_app and GoTrue's /health. Down is not healthy: 503 when
// either does not answer, and the body says which, never why.
//
// Both checks run in parallel and each has HEALTH_BUDGET_MS, so the answer
// comes well inside the 5 s the compose healthcheck allows: a 503, not a
// timeout. A check that runs past its budget is reported as down; its own
// connection timeout (db.ts, gotrue.ts) still frees it later.
import { BobConfigError } from './runtime.ts'

export const HEALTH_BUDGET_MS = 2000

export type HealthDeps = {
  db: () => Promise<unknown>
  identity: () => Promise<boolean>
}

function within<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const late = new Promise<never>((_, ko) => { timer = setTimeout(() => ko(new Error(`no answer in ${ms} ms`)), ms) })
  return Promise.race([p, late]).finally(() => clearTimeout(timer))
}

export async function boxHealth(deps: HealthDeps, budget = HEALTH_BUDGET_MS): Promise<Response> {
  const [db, identity] = await Promise.all([
    within(Promise.resolve().then(deps.db), budget).then(() => 'ok', (e) => {
      console.error('health: bob_app read failed', e instanceof Error ? e.message : e)
      return 'error'
    }),
    within(Promise.resolve().then(deps.identity), budget).then((up) => (up ? 'ok' : 'error'), (e) => {
      if (e instanceof BobConfigError) return 'unconfigured'
      console.error('health: GoTrue check failed', e instanceof Error ? e.message : e)
      return 'error'
    }),
  ])
  const up = db === 'ok' && identity === 'ok'
  return Response.json({ status: up ? 'ok' : 'down', db, identity, version: '1.0.0' },
    { status: up ? 200 : 503, headers: { 'Cache-Control': 'no-store' } })
}
