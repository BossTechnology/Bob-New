// The live tests skip without BOB_TEST_DATABASE_URL. In the CI job that
// starts the stack (BOB_REQUIRE_LIVE=1) a missing URL is a failure, not a
// quiet skip: otherwise a broken job would report every live test as passed.
import { test } from 'node:test'
import assert from 'node:assert/strict'

test('the live job really has a database', { skip: process.env.BOB_REQUIRE_LIVE !== '1' && 'not the live job' }, () => {
  assert.ok(process.env.BOB_TEST_DATABASE_URL, 'BOB_REQUIRE_LIVE=1 but BOB_TEST_DATABASE_URL is not set')
})
