// Runs once when the server starts. In the box (BOB_CAJA=1) BOb refuses to
// start with missing configuration or with a credential it must not hold
// (insumos de Bzzz §4.2, puntos 2 a 5). Outside the box it does nothing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertBoxEnv } = await import('./lib/bob/runtime.ts')
  assertBoxEnv()
}
