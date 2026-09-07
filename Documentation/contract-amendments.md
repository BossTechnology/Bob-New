# Contract amendments and findings

**Why this file exists.** A slice is complete when its acceptance criteria pass,
tenancy passes, the rebuild test passes, and **no contract was amended — or the
amendment is written down.**

BOb is the first application on BzzzBX. The real test is whether one projection
schema and one binding model serve both BOb and Momentum without amendment.
Every place BOb needs the contract changed is evidence about whether the
standard holds. Recorded here; not quietly worked around.

Two registers:

- **A-nn · Amendments** — the specification says one thing, the build does
  another, deliberately.
- **F-nn · Findings** — something is wrong or unresolved and no amendment fixes
  it yet.

---

## Slice 0 · Foundations

### A-01 · `organizations.slug` already exists

**Contract:** Implementation Handoff §4.2 writes
`ALTER TABLE organizations ADD COLUMN slug TEXT NOT NULL`.

**Repository:** the column has existed since `20260606120000_initial_schema.sql`
as `slug TEXT NOT NULL UNIQUE`.

**Amendment:** migration 2 adds only the shape constraint and the immutability
guarantee. The `ADD COLUMN` would fail.

**Weight:** low. The Handoff describes the target state and was written without
the repository open. Not evidence against the standard.

---

### A-02 · Slug immutability is gated on a marker BOb owns

**Contract:** Handoff §4.2 and Migration Order step 2 — the slug is immutable
"once telemetry has been emitted under it", enforced by trigger.

**Problem:** BOb cannot evaluate that condition. Whether telemetry exists is a
fact in the truth store, and the rule that generates the other five is that BOb
never queries the truth store. A Postgres trigger in Supabase has no path to the
answer.

**Amendment (D-18, ruled):** `organizations.telemetry_started_at`. NULL means no
telemetry as far as BOb has been told; once set, the slug freezes. The marker is
itself protected — it cannot be cleared or moved, or the gate would be a
formality.

**Weight: this is real evidence.** The contract states a condition in terms of
platform state that an application is forbidden from reading. Momentum will hit
the same wall on the same column. **The platform should say who sets this marker
and when**, rather than each application inventing its own.

---

### A-03 · `provider` is an open column, so R-01 removes a CHECK rather than correcting one

**Contract:** Decision Sheet R-01 says to correct `'bzzzbox'` to `'bzzzbx'` in
the CHECK and the DEFAULT. Data Model §3.4 defines `provider TEXT NOT NULL` with
no CHECK, commented `bzzzbx | customer | named integration`.

**Amendment (D-20, ruled):** the CHECK is removed, the DEFAULT is corrected. A
two-value enumeration would reject a customer's own RPA vendor, which §3.4
explicitly permits. The misspelling is now caught by
`tests/naming.test.mjs`, which is a stronger guard than the CHECK was — it
covers the whole repository rather than one column.

**Weight:** low, but note that the string is no longer protected by a database
constraint. If the naming test is ever deleted, nothing catches the next one.

---

### A-04 · `channels.lag_seconds` is nullable, amending Handoff §4.2

**Contract:** Handoff §4.2 specifies `lag_seconds INTEGER NOT NULL DEFAULT 0`.

**Amendment (D-25, ruled):** nullable, no default. NULL means **not declared**.

**Why the Handoff is wrong here.** Zero is not the absence of a declaration; it
is a declaration that the channel is live. A voice channel is not live — a
twelve-minute call produces its facts after it ends — so a zero default asserts
something about every channel that nobody has checked. This is the PR-10
absent-versus-zero trap one level down, in the column that decides whether a
threshold may evaluate against an open bucket (PR-7). Being wrong here fires
alerts on incomplete data.

**Obligation this creates on Slice 5.** The evaluator must refuse to evaluate an
open bucket for a channel whose lag is undeclared, rather than treating NULL as
zero. That is not enforced by the schema and must be enforced by the evaluator.

---

### A-05 · PR-4 is enforced on one path of two — UNBLOCKED, NOT CLOSED

**Contract:** PR-4 — BOb never writes a projection table, enforced by a Postgres
grant rather than convention.

**What shipped:** `bob_app`, `bob_feeder` and `bob_ai_ro` with correct grants,
and `bob_grant_projection()` applying the pattern to each projection table in
Slice 2 — including a revoke against `authenticated`, the role PostgREST
switches to. Without that revoke, Supabase's own default privileges would make
the grant on `bob_app` decorative.

**What is still not covered:** the service role, used across 25 route files. It
bypasses RLS and holds broad grants.

**N-04 is now CLOSED** — full stack on the VPS, direct Postgres connection. That
makes A-05 **fixable, and does not fix it.** Two things must happen, neither of
which belongs in a migration:

1. `bob_app` becomes a LOGIN role with a credential, and BOb's connection string
   uses it. A password cannot be invented in a migration.
2. The service-role read paths move to the user-scoped client, so
   `authenticated` is the effective role on every read.

**Scheduled for Slice 2**, alongside the schema move to `bob`.

**Do not record A-05 as closed until both are done.** The claim "PR-4 is
enforced by grant" is currently true of one path out of two, and a document
saying otherwise would describe a guarantee the database does not provide.

---

### F-02 · `/api/cron/cleanup` deletes across all tenants

Deletes from `audit_log` and `notification_log` by timestamp with no `org_id`
predicate, as the service role. Correct behaviour for a platform retention
sweep, but it is a cross-tenant DELETE and nothing says so. Moves to `pg_cron`
in Slice 5; the tenant dimension should be explicit when it does.

---

### F-03 · `/api/interactions/batch` takes the tenant from the caller

Inserts a caller-supplied array into `interactions` as the service role, behind
a shared service token. The `org_id` on each row is whatever the caller writes,
so a single leaked token writes to any tenant.

**Disposition:** superseded. `interactions` leaves BOb at Migration Order step
18 and returns as `proj_metric_counts`, written by the feeder with the tenant
fixed by parameter. Not fixed in Slice 0; recorded so the removal is deliberate.

---

### F-04 · `/api/metrics/snapshot` takes the tenant from the request body

Same shape as F-03: `body.org_id` behind a shared service token.

**Disposition:** superseded. `metric_snapshots` is replaced by the projection
layer in Slice 2.

---

### F-05 · ID-11 is only partially provable in Slice 0

Registry scope never crosses a tenant boundary. Provable now against
`autobotz.scope_kind`, which lands in migration 1, and against
`notification_channels` at the row level. `threshold_configs`, `anomaly_rules`
and `text_rules` do not gain `scope_kind` until Migration Order Phase C, so
full coverage completes in Slice 6.

---

### F-06 · `channel_actor_mix` does not exist in the repository

Handoff §4.1 lists it under Configuration and C-07 rules `present` load-bearing
for FR-11, UI-03 and PR-10. There is no such table in any migration. It is
needed by Slice 1 or Slice 2 and has no step in the Migration Order.

---

### F-07 · Existing AutoBotz bindings carry no BR-3 ruling

`autobotz.mutative` ships with no default, and the constraint enforcing it is
`NOT VALID` — enforced on every insert and update, exempting rows that predate
the migration. Those rows are unruled rather than defaulted to `false`, because
a default would assert something about them that nobody has checked.

```sql
SELECT id, label, type FROM autobotz WHERE mutative IS NULL;
-- once each is ruled:
ALTER TABLE autobotz VALIDATE CONSTRAINT autobotz_mutative_declared;
```

---

## Slice 1 · Actors and Availability

### A-06 · Migration Order step 5 is deleted

`interaction_actors` is not built (D-30 / Q14, ruled: the feeder's).

Handoff §4.1's state contract lists live state explicitly and does not include
it. It is not among the eight projection tables either. Its foreign key pointed
at `interactions`, which is dropped at step 18. Per-interaction grain is
truth-store grain.

**Weight: this is evidence.** It is the one place the Data Model and the
Handoff's state contract disagreed about *ownership* rather than about wiring.

---

### A-07 · Data Model §5.3 is superseded in full

It specifies a table BOb will not build. Follows from A-06.

---

### A-08 · `channel_actor_mix` created with no step in the Migration Order

Closes F-06. Listed in Handoff §4.1 under Configuration, ruled load-bearing by
C-07, and present in no migration. Built in Slice 1 rather than Slice 2 because
`buildHumanRoster()` scopes human availability to channels whose mix carries
humans, and FR-23's required explanation is read off this table. There is no
other source for it.

Per Q13 it carries `present` and nothing else. No `share`, `bias` or `weight`:
attribution reads the observed split from `proj_metric_counts`, and multiplying
an observed split by an assumed one double-counts.

---

### A-09 · `actor_shifts.status` drops `'live'`

D-26 / Q11, ruled: liveness is derived. A stored `'live'` beside `starts_at` and
`ends_at` is a second answer to a question the timestamps already answer, and
the two disagree the moment a shift ends with nothing to update the row.
Availability would report agents who went home — plausibly, with nothing looking
broken.

Removed for the same reason R-03 removed `'pending'`.

---

### A-10 · `actors` carries ASA instance counts

D-27 / Q12. Data Model §5.1 gives ASA rows only `build_version` and `provider`.
ASA availability sums live instances, so FR-21 could not be built as specified.
`instances_total` and `instances_live` added, constrained to ASA rows.

---

### F-08 · `channel_type` had no value for a website — CLOSED

The Product Document names a website as an ASA. The CHECK admitted bot,
whatsapp, voice, app, forms, email, social, retail, google, tickets, chat and
reddit, and nothing for the most common static surface a business has.

**Ruled (a): `website` added**, in `20260903100400_channel_type_website.sql`.

Folding it into `forms` or `app` was the alternative and it is worse than it
looks: FR-11 and UI-03 report per channel, so a website, a contact form and a
Google business listing collapsed into one bucket would be visible to a customer
as three surfaces reporting as one — with no way to separate them afterwards
without a data migration.

---

### F-09 · The test suite could report green while a third of it did not run

Found by inspection during Slice 1, not by a failure.

Every test file loads fixtures into the same database and fixture loading
deletes before it inserts. Under `node --test`'s default parallel file
execution, two files deadlock. Node reports the casualties as
`cancelledByParent`, **which does not increment the failure count** — the run
printed `# pass 43 # fail 0` while twenty-four assertions never executed.

A tenancy suite that goes quietly green while not running is the exact failure
ID-12 exists to prevent.

**Fixed at two levels.** The npm scripts and CI pass
`--test-concurrency=1`. Independently, `connect()` takes a session-scoped
advisory lock, so that anyone changing that flag later gets a slow suite rather
than a dishonest one. Verified: forced concurrency 8 now yields 67 tests,
0 cancelled.

---

### D-03 should be re-scoped on the Decision Sheet

It is written as blocking `interaction_actors.contribution`. That column now
never exists in BOb. D-03 becomes a projection-contract question — what
`proj_actor_metrics` carries beyond `handled_count` — to be answered with the
BzzzBX team rather than inside BOb. Still open, still blocking CF-12 and v1.1,
but currently filed against the wrong owner.

---

### D-02 scope extended

`actors.instances_live` is BOb's live state, but the truth about how many ASA
instances are running comes from a deployment registry. At connection something
must keep this column current or ASA availability freezes at its seeded value —
silently and plausibly, which is the FR-20 failure mode in different clothes.

---

## Slice 1b · Findings from applying Slices 0 and 1

All four found by the developer during application. Three are defects in what
was delivered.

### F-10 · The naming test skipped `public/`, where the misspelling lived

`tests/naming.test.mjs` excluded `public/` to avoid scanning build output.
`public/dashboard.html` carried `'bzzzbox'` six times — including at the payload
its backend bridge POSTs to `/api/config/autobotz`.

**This is worse than a missed occurrence.** A-03 removed the `provider` CHECK
constraint on the explicit argument that the naming test "covers the whole
repository rather than one column." It did not. A database constraint was
removed on the strength of a guard with a hole, and the hole was exactly where
the defect lived. Persisting a binding would have reintroduced R-01.

**Fixed.** `public` is scanned; build output is excluded by extension instead.
`.html` added to the scanned set. Verified by sabotage: reintroducing the string
turns the suite red.

---

### F-11 · A fourth consumer of the AutoBotz API was missed

The Slice 0 handoff named three route files as affected by the rename. There
were four consumers. `public/dashboard.html` has a live backend bridge that
sends `client_id`, `scope`, `ref` and `config`, sends no `mutative`, and reads
`row.client_id`, `row.scope`, `row.ref` and `row.verify_ts` back.

After the rename, create and update would have returned 400 on the BR-3 check
and the read path would have found nothing. **CI was green throughout**, because
the suite covered schema, tenancy and availability and nothing looked at
`public/`.

**Fixed** under ruling B(a): the bridge is aligned rather than disabled, because
it is the only working AutoBotz configuration path until Slice 6 builds the real
one.

**New permanent guard:** `tests/simulator-bridge.test.mjs` reads the actual
column list from the database and asserts the bridge names nothing that no
longer exists. The next rename fails there rather than at runtime.

---

### F-07 · Superseded — five bindings, not four, and none persisted

F-07 stated that four AutoBotz bindings carried no BR-3 ruling and gave a
`SELECT` to list them. **The table is empty.** There are five, they are `ab1`
through `ab5` seeded in `window._autoBotz`, and they had never been persisted.
The claim inferred database state from a migration comment rather than checking.

**Ruled and recorded in the seed:**

| | Type | `mutative` | Reason |
|---|---|---|---|
| ab1 · Auto-Scale Webhook | webhook | **true** | Scales infrastructure |
| ab2 · Incident Bridge | webhook | **true** | Creates an incident |
| ab3 · Checkout Flow Check | synthetics | **true** | See below |
| ab4 · CRM Case Opener | rpa | **true** | Opens a case |
| ab5 · Root-Cause Triage | agent | **false** | Analyses, changes nothing |

**ab3 is BR-3's own example and the ruling is deliberate.** The check walks the
checkout to completion, because a monitor that stops before payment does not
tell you payments work — and payment failures are the ones that cost money and
hide best. Every run therefore creates a real order. It ships with
`requires_approval` set.

**This is the first mutative binding in the example set**, which means the
fixture now exercises the harder path rather than the easy one.

**New in the interface:** the create form has a BR-3 control with no default,
and `addAB` refuses to create a binding without a ruling. `persistAB` refuses to
send one. The server-side constraint was already there; nothing upstream of it
asked the question.

---

### F-12 · `Documentation/` is gitignored, so the handover artifact was untracked

`.gitignore` excluded `Documentation/*` except `New/*.docx`. **This file** — the
one the new-session prompt instructs the next session to read from the
repository — was not tracked.

**Fixed:** an exception for `Documentation/contract-amendments.md`.

---

### D-31 · What does `mutative = true` cause BOb to do? — OPEN

BR-3 says BOb refuses to register a binding without a ruling. It does not say
what BOb does with the ruling once it has it.

This did not matter while every example binding was inert. ab3 is mutative and
attachable to a response rule, so it does now: a rule that runs the checkout
check when abandonment breaches would create one real order per firing.

`requires_approval`, `rate_limit_per_hour`, `concurrency_limit` and
`invocation_cap_daily` exist for this and nothing yet reads them.

**Blocks Slice 6, not Slice 2.** AutoBotz execution is out of v1 and the outbox
drains to a stub, so nothing fires today. The rule needs deciding before it can.

---

## Environment findings

**Postgres 17.6, not 15 or 16.** The suite passes on 15 and 17.6, so 16 is safe
by interpolation. The environment is Supabase Cloud while X-01 and X-03 specify
self-hosted on the VPS, so it is interim by definition. **Ruled: leave 17.6
alone; revisit the fleet pin when the first VPS instance is built.**
`config.toml` is unchanged.

**`package.json` was shipped as a full-file replacement** and would have
reverted dependency bumps already on `main` — `next` 16.3.3→16.2.6,
`@supabase/ssr` 0.12.5→0.5.2, `react` 19.2.8→19.2.4. It was merged instead, with
only the test scripts and `pg` taken. **The package should have shipped a patch
instruction, not a file.**

**N-08 has a concrete instance behind it.** One organization and five channels
exist in the hosted environment. System Flows §3 identifies configuration and
live state as the only data that cannot be rebuilt, and its backup has no named
owner. Migrations were correctly not applied there.

---

*Boss.Technology · BOb v1 · Internal only*
