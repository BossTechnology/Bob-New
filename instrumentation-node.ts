// The Node half of instrumentation.ts: only the Node runtime imports it, so
// process.exit never reaches the Edge build.
import { assertBoxEnv, isBox } from './lib/bob/runtime.ts'
import { startBox } from './lib/bob/startup.ts'

export async function registerNode() {
  if (!isBox()) return
  await startBox({
    assertEnv: () => assertBoxEnv(),
    checkLogin: async () => (await import('./lib/bob/db.ts')).checkLoginAtStartup(),
    exit: (code) => process.exit(code),
    log: (m) => console.error(m),
  })
}
