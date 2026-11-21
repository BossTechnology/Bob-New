// Runs once when the server starts. In the box (BOB_CAJA=1) BOb refuses to
// start with missing configuration or with a credential it must not hold
// (insumos de Bzzz §4.2, puntos 2 a 5), or with a privileged database login.
// Outside the box it does nothing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertBoxEnv, isBox } = await import('./lib/bob/runtime.ts')
  assertBoxEnv()
  // A login that is superuser or BYPASSRLS could read around RLS: refuse to
  // start. If the database is not up yet, the first read checks again.
  if (isBox()) await (await import('./lib/bob/db.ts')).checkLoginAtStartup()
}
