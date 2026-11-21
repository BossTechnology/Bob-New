// Box start-up (insumos de Bzzz §4.2, puntos 2 a 5): with missing
// configuration, a credential BOb must not hold or a privileged database
// login, BOb does not start. Next only logs an error thrown in register(), so
// the process exits itself; otherwise the container stays `running` and
// answers 500 on every route.
export type StartDeps = {
  assertEnv: () => void
  checkLogin: () => Promise<void>
  exit: (code: number) => void
  log: (message: string) => void
}

export async function startBox(deps: StartDeps): Promise<void> {
  try {
    deps.assertEnv()
    await deps.checkLogin()
  } catch (e) {
    deps.log(e instanceof Error ? e.message : String(e))
    deps.exit(1)
  }
}
