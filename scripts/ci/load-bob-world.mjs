// Loads BOb-engine's two-tenant fixture into a local stack and runs its
// reference feeder over the fixture events (2026-11-18 14:00-14:30), so the
// live tests of bob-web read real projections as bob_app. All the data is
// BOb-engine's fictitious test fixture. Does not reset the stack.
//
//   BOB_ENGINE_DIR=../BOb-engine SUPABASE_DB_URL=postgresql://... node scripts/ci/load-bob-world.mjs
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

const engine = resolve(process.env.BOB_ENGINE_DIR || '../BOb-engine')
const from = (p) => import(pathToFileURL(resolve(engine, p)).href)
const { connect, connectAs, loadFixture, loadRoster, loadFeederWorld } = await from('tests/helpers/db.mjs')
const { MemoryTruthStore } = await from('feeder/memory-truth-store.mjs')
const { runFeeder } = await from('feeder/reference-feeder.mjs')

const FIXTURE = JSON.parse(readFileSync(resolve(engine, 'supabase/tests/fixtures/feeder_events.json'), 'utf8'))
const db = await connect()
await loadFixture(db)
await loadRoster(db)
await loadFeederWorld(db)
// The tests switch to bob_app from the stack's postgres, as BOb-engine's own
// suite does. In a box the login is bob_app itself.
await db.query('GRANT bob_feeder, bob_app TO current_user')
const feeder = await connectAs('bob_feeder')
const truth = new MemoryTruthStore({ events: FIXTURE.events, watermark: FIXTURE.watermark })
const r = await runFeeder(feeder, truth, { from: '2026-11-18T14:00:00Z', to: '2026-11-18T14:30:00Z' })
console.log('fixture loaded; watermark', r.watermark)
await feeder.end()
await db.end()
