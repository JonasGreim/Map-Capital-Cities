# Seed-once validation — Issue #69

28 October 2026. Base: `c007b83dcecfd2b9c3f43dd7286874c6b2592cac`.
Node 24.22.1, npm 11.19.1, PostgreSQL 16 (`postgres:16`).

## Checks

- `npm ci`: passed after running outside the sandbox (its esbuild execution was
  initially blocked with EPERM).
- `npm run check`: passed (lint, app/test TypeScript, both production builds).
- `TEST_DATABASE_URL=… npm test`: **167 passed, 0 failed, 0 skipped**:
  backend 75, frontend unit 90, frontend branding HTTP 2.
- All three PostgreSQL suites ran against a new temporary-storage container
  `map-capitals-issue69-pg` on loopback port 55469. Tests used unique schemas;
  no development database or existing volume was used.
- `git diff --check`: passed; complete code/test/documentation diff reviewed.
- `default-capitals.json` unchanged, SHA-256
  `f27e2cb2f64a5ebbf8574c56e14628f6ddd477e8150bd6e9ff73727686d03fa4`.
- `npm audit`: two existing development-tool findings (Vite high, esbuild
  moderate); `npm audit --omit=dev`: zero. No dependency changes or force fixes.

## PostgreSQL regression evidence

The initialization suite starts with no tables and validates schema bootstrap,
complete paginated import, persisted flags/continents/population/currencies,
including zero, maximum safe integer, nulls and countries without capitals.
A separate pool loads identical metadata with no key and an upstream fetch
function that fails if called. HTTP CRUD, all-row deletion and restart preserve
values/IDs or the deliberately empty table. Legacy backfill preserves every
existing row and ID and does not recreate missing defaults.

Failed later API pages, capital/metadata/marker writes and empty/invalid source
results leave no completion marker and can be retried. Concurrent initializers
fetch only once; the waiter also succeeds when its normal query timeout is shorter
than the first import. A failing first initializer releases the transaction lock
and the contender successfully initializes. Reset restores the existing snapshot
without changing persisted metadata or completion timestamp. Existing constraint,
SQL-parameterization, CRUD and reset regressions also pass.

## Full-stack and development smoke tests

Built and started the complete `compose.yaml` stack with isolated project
`map-capitals-issue69`, its new retained volume
`map-capitals-issue69_demo-pgdata`, browser port 8089 and DB port 55470. All three
containers became healthy. Temporary overrides/fixtures remained in `/tmp` and
were never included in application images or Git.

The first live attempt returned invalid JSON and correctly exited before HTTP;
SQL confirmed **0 capitals, 0 metadata rows, 0 completion markers**. A subsequent
live format check and a fresh live startup succeeded. The fresh `capitals_live`
database had no Docker entrypoint schema; the backend created it transactionally.
Live results: **3 pages, 254 countries, 5 invalid capitals skipped, 1 uniqueness
conflict, 248 capitals and 254 metadata rows, 1 completion marker**.

A separate controlled two-page fixture smoke also passed full-stack HTML/health,
metadata and real HTTP CRUD. Recreating its API without a key and with upstream
requests deliberately blocked preserved all rows and IDs and logged `loaded`,
without any upstream request. Reset returned 248 enriched defaults, retaining
its 3 metadata rows and marker. This is controlled upstream evidence, not live
REST Countries availability evidence.

With the real live dataset, create/edit/delete requests passed, followed by
keyless API recreation and restart. Exact response values and IDs were unchanged;
Ottawa stayed deleted and the edited Berlin/custom row persisted. The normal
container had no fixture installed. Reset restored 248 enriched defaults while
PostgreSQL retained all 254 metadata rows and the completion marker.

An isolated Chromium smoke showed the production app, real map canvas, 248 map
markers and country flags, with zero console errors (four browser warnings).
No frontend code changed; the full browser regression matrix was not rerun.
`npm run dev` also started both workspaces with the isolated live database,
API port 3019 and an empty REST Countries key: API logged `loaded`, Vite and
`/health`/`/capital` HTTP checks passed. Both development processes were stopped.

Only this task's Docker containers/network were stopped after verification;
the new Compose volume was retained. No existing volumes were deleted or reset.
The transient live response failure does not weaken initialization validation;
uninitialized databases still require a valid key and available upstream.
Metadata is intentionally not refreshed automatically. Empty legacy tables
without a marker seed once; completed empty tables remain empty.

CI now runs all PostgreSQL suites on a disposable PostgreSQL 16 Actions service.
The actual PR-head CI result is reported separately when publishing the PR.
No Render deployment, cold-start UX work or public infrastructure was introduced.
