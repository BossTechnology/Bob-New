// Runs once when the server starts. In the box (BOB_CAJA=1) BOb refuses to
// start with missing configuration, with a credential it must not hold
// (insumos de Bzzz §4.2, puntos 2 a 5) or with a privileged database login,
// and the process exits so the container does not stay `running`
// (lib/bob/startup.ts). If the database is not up yet, the first read checks
// the login again. Outside the box it does nothing.
//
// Next's pattern for Node-only code: the import sits inside the NEXT_RUNTIME
// check, so the Edge build leaves it out.
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { registerNode } = await import('./instrumentation-node.ts')
    await registerNode()
  }
}
