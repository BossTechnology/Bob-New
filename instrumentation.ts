// Runs once when the server starts. In the box (BOB_CAJA=1) BOb refuses to
// start with missing configuration, with a credential it must not hold
// (insumos de Bzzz §4.2, puntos 2 a 5) or with a privileged database login,
// and the process exits so the container does not stay `running`
// (lib/bob/startup.ts). If the database is not up yet, the first read checks
// the login again. Outside the box it does nothing.
export async function register() {
  if (process.env.NEXT_RUNTIME !== 'nodejs') return
  const { assertBoxEnv, isBox } = await import('./lib/bob/runtime.ts')
  if (!isBox()) return
  const { startBox } = await import('./lib/bob/startup.ts')
  await startBox({
    assertEnv: () => assertBoxEnv(),
    checkLogin: async () => (await import('./lib/bob/db.ts')).checkLoginAtStartup(),
    exit: (code) => process.exit(code),
    log: (m) => console.error(m),
  })
}
