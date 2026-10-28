# Testing

[Project overview](../README.md) · [Development](development.md) · [Technical reference](technical-reference.md)

## Default checks and CI

```bash
npm run lint           # ESLint flat config, TypeScript, React and React Hooks rules
npm run typecheck      # both workspaces, including backend tests
npm run build          # backend TypeScript + frontend Vite production build
npm run check          # lint + typecheck + build
npm test               # backend tests plus frontend API, Zustand and list-state tests
git diff --check
```

CI runs `npm ci`, `npm run check`, backend tests, frontend unit tests and Vite
branding integration in separately named steps on PRs and main pushes, using the
pinned runtime without secrets. The backend step uses an isolated PostgreSQL 16
service, so all PostgreSQL suites run in CI. `npm test` still runs all suites;
the frontend scripts `test:unit` and `test:branding` expose the same split locally.
The job is limited to 10 minutes, with shorter per-step limits; Node tests and
branding HTTP requests also have timeouts. Branding logs identify dev, build,
preview and cleanup phases. Import tests mock REST
Countries; backend API tests inject a fake DB. Frontend tests use the existing
Node test runner/tsx with mocked fetch and React server rendering; they need
neither a browser nor a Mapbox token. The optional PostgreSQL suite skips
unless `TEST_DATABASE_URL` is explicitly set (see below). Verify the real running
API separately with `curl -i http://localhost:3001/health` after startup completes.
App construction (`buildApp` in
`backend/src/app.ts`) does not start a listener.

`npm audit` still reports Vite 5 (high) and its esbuild dependency (moderate).
These development-tool advisories require a separately reviewed Vite upgrade;
do not use `npm audit fix --force`. On 24 October 2026, `npm audit --omit=dev`
reported no production dependency vulnerabilities. Keep development servers on
trusted networks; the configured Vite server binds to all interfaces by default.
The Express/body-parser and shell-quote
findings were removed by the Fastify migration and a compatible concurrently 9 update.

The [final validation report](final-validation.md) records the independently
checked assignment requirements, fresh setup, live PostgreSQL/Mapbox results,
remaining limitations and manual submission checklist for Issue #7.
The later [repository cleanup audit](repository-cleanup.md) records Issue #61
findings, validation and readiness for the final #62 acceptance pass.
The [final acceptance report](final-qa.md) records #62 with both PostgreSQL suites,
all existing browser suites and real isolated full-stack acceptance.

Repository Codex guidance is in [AGENTS.md](../AGENTS.md); use `$issue-work #N` for implementation
and `$pr-review #N` for a read-only review. `.codex/config.toml` contains pinned,
isolated Playwright and headless Chrome DevTools MCP servers, without an authenticated
profile. Their browser availability can be checked during UI work; they are not
required for the static checks above.

## Isolated PostgreSQL integration

The regular Docker Compose database uses host port **5432**. For real PostgreSQL
checks, use a separate **disposable test database** on host port **55432**. Run
this example from the repository root with that port free:

```bash
(
  set -e
  test_container=$(docker run --detach --rm \
    --publish 127.0.0.1:55432:5432 \
    --env POSTGRES_PASSWORD=postgres --env POSTGRES_DB=capitals_test \
    --tmpfs /var/lib/postgresql/data postgres:16)
  trap 'docker stop "$test_container" >/dev/null' EXIT
  TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:55432/capitals_test npm test
)
```

This starts PostgreSQL 16 with temporary in-memory storage and stops/removes
only that test container when the subshell exits, including when tests fail.
It does not mount or modify the normal development database or its volumes.
The integration suite uses `TEST_DATABASE_URL`, waits for PostgreSQL readiness,
creates a uniquely named temporary schema, tests constraints, multi-page import,
low-level repeat imports, rollback, CRUD HTTP requests and DB-backed health,
then removes only that test schema. It never falls back to `DATABASE_URL` and
skips these integration checks when `TEST_DATABASE_URL` is unset. REST Countries
is still mocked; no real API key is needed. First startup with a valid key logs
initialization/import counts before HTTP; subsequent startups log `mode: loaded` and do not call REST Countries.

### Seed-once regression coverage

[Issue #69 validation evidence](seed-once-validation.md) records the real PostgreSQL,
Docker live/controlled-upstream, keyless restart and development smoke results.

`backend/test/initialization-postgres.test.ts` exercises a fresh schema and complete
paginated mock import, persisted metadata including countries without capitals,
a separate backend pool boot with no key/network, real CRUD and intentionally
empty data across restart, populated legacy migration without resurrecting rows,
failed later pages, capital/metadata/marker-write rollback and retry, empty-source
rejection, concurrent initializers with a short ordinary client timeout, and reset
without metadata/marker changes. Each case owns a unique schema in the explicitly
selected disposable database. `initialize-database.test.ts` also covers warm-path
query behavior, missing keys, connection errors and uncertain COMMIT failures with
safe errors. External fetches are controlled; actual persistence/locks/rollback
are verified in PostgreSQL 16. The existing schema/CRUD/reset suites remain active.

## Coverage status

The normal commands and CI measure test success, not a coverage percentage.
No coverage report or automatic percentage badge is currently published. Node 24
has an optional built-in V8 coverage collector, so local measurement needs no new
dependency; a scoped backend diagnostic can be run from the repository root:

```bash
(cd backend && node --import tsx --test --experimental-test-coverage --test-coverage-include='src/**/*.ts' test/*.test.ts)
```

This diagnostic covers loaded backend sources in that run, skips PostgreSQL
integration unless configured and excludes frontend/browser execution. It is not
whole-project coverage, a threshold or a CI badge data source. No checked-in
coverage artifacts existed when this documentation was prepared. V8/tsx reports
need source-map validation before treating their line/branch totals as a stable
project metric; unloaded files such as the server entry point are not included.

A reliable README percentage would also need a source-mapped project-wide report
and an automatically hosted badge source. The private repository has no existing
coverage publisher; Actions artifacts are not a direct README image endpoint.
Adding a public upload, external service, token or write-enabled publication job
would exceed this documentation change. The native Actions badge therefore shows
CI status only; no manually maintained percentage or test-count badge is used.

## Frontend test ownership

Use `$test-audit` for test authoring, changes and reviews; the short rules live in
[AGENTS.md](../AGENTS.md). The [Issue #73 audit](frontend-test-audit.md) records the
baseline declaration ledger, consolidation decisions and preservation evidence.
`api.test.tsx` owns loading transport/validation, `api-metadata.test.tsx` owns optional
response metadata, `loading.test.tsx` owns shared-request/retry transitions and
`list.test.tsx` owns initial list semantics and search. Mutation, selection,
filter, storage and marker-controller suites retain their distinct lifecycle
contracts. `storage-fixture.ts` supplies only the shared in-memory Storage double.
Native layout/keyboard/Mapbox behavior belongs to the browser suites below.

## Browser tests: fixture API and real Mapbox

The [Issue #74 audit](browser-test-audit.md) records baseline owners, removed
redundancies, retained contracts and validation. All ordinary browser suites use
real React, native browser dialogs and intercepted capital HTTP requests. They
start only Vite and Chromium, never an API or database. These are **browser tests
with a mocked API**, not full-stack E2E tests or PostgreSQL persistence evidence.

Playwright **1.62.1** is an exact frontend development dependency in the workspace
lockfile. Its Chromium revision **1234** (Chrome Headless Shell 151.0.7922.34) is
installed by Playwright, rather than depending on a globally installed browser.
Use Node 24.22.1/npm 11.19.1 and run from the repository root:

```bash
npm ci
npx --no-install playwright install --with-deps chromium
npm run test:browser:smoke -w frontend
```

`test:browser:smoke` runs `smoke` and `loading` in fresh isolated contexts.
It forces an empty Mapbox token and same-origin fixture API at Vite configuration
level, even if root `.env` contains credentials or an external API URL. External
requests are blocked and fail the token-free tests. No Mapbox token, REST Countries
key or PostgreSQL service is needed. The smoke checks search, no-token/manual
coordinates, native focus/validation, CRUD with pending and failed responses,
confirmed reset and lost-response read-only recovery. Loading checks delayed
success/5-second explanation, reduced motion, hidden-list errors/keyboard retry
and empty success at selected narrow/desktop sizes. API units own the transport
error/deadline matrix; there is no fabricated AbortSignal clock or source rewrite.

The existing CI job installs this pinned Chromium and runs smoke on every PR and
main push with a two-minute step timeout. Its existing PostgreSQL service and
backend/unit/branding steps remain. Browser smoke does not use that database.
`npm test` continues to run backend tests, frontend units and Vite HTTP branding;
browser commands are explicit and separately named in CI.

### Local full browser suite

```bash
# Valid public Mapbox token in root .env or VITE_MAPBOX_TOKEN environment.
npm run test:browser:full -w frontend

# Select one or several owners; unknown names fail rather than silently skip.
BROWSER_SUITES=map,coordinate-picker npm run test:browser:full -w frontend
BROWSER_SUITES=loading npm run test:browser:smoke -w frontend
```

The full command includes smoke plus the following targeted owners:

| Suite | Primary contract / external prerequisites |
| --- | --- |
| `layout` | Native menus/combobox, collapsed rail, focus, 700px breakpoint, compact dialogs, 200% text, safe areas/toast; no external network. |
| `branding` | Native home reload/keyboard, decoded SVG and motion/reduced motion; no external network. HTTP dev/build/preview contracts remain in `branding.test.ts`. |
| `map` | Actual Mapbox markers/popups, list selection, keyboard zoom/pan/reset, filter safety, color reload/storage failures, popup CRUD, reset; Mapbox resources required. |
| `coordinate-picker` | Actual canvas selection/drag, draft/Cancel/Escape, preview/cursor cleanup, failed save and WebGL loss/restoration; Mapbox resources required. |
| `flags` | Held image loading, actual decoded CDN images, failure fallback and country-edit/cache reuse; Mapbox and REST Countries flag CDN required (no REST API key). |
| `map-errors-construction` | Browser WebGL capability failure leaves list and manual form usable; token required to enter map construction. |
| `map-errors-style` | Intercepted style failure, disabled controls, list/form availability and real reload recovery; Mapbox required for recovery. |

Map suites run against real Mapbox with controlled capital data. They establish
frontend/Mapbox integration, **not** real API/database writes. Desktop plus
390px/320px selections and relevant short landscape/large-text cases remain;
mutations are not replayed at every viewport. Full browser CI is intentionally
not enabled. A public `pk` token permitted for `http://localhost:5188`, WebGL and
external Mapbox/CDN availability are local prerequisites. Never use a secret
`sk` token. No private token is injected into CI.

The runner uses localhost:5188, action/navigation timeouts (15/30 seconds),
60-second token-free / 120-second map suite limits and an eight-minute overall
deadline. Every suite owns a fresh context; contexts, browser and Vite close on
success/failure, and SIGINT/SIGTERM trigger cleanup. A missing full-suite token
fails explicitly. `PLAYWRIGHT_CHROMIUM_EXECUTABLE` can select a local executable
for diagnostics; omit it to validate the pinned browser. Optional
`BROWSER_SCREENSHOT_DIR=/tmp/capital-browser-shots` (create the directory first)
saves requested screenshots/failure images outside the repository. No traces,
HARs, served bundles or browser sessions are committed.

There are no React/Vite source replacements, injected store/root APIs or
production test hooks. Map geometry/identity is observed in rendered DOM; actual
WebGL context events exercise recovery. These Chromium checks do not establish
physical iOS/Android keyboard or assistive-technology behavior.

### Opt-in production-build full-stack smoke

`deployment.browser.mjs` remains a separate executable against an **explicitly
selected disposable loopback API/database**. It performs real CRUD and reset;
never point it at development, production or shared data. Allow
`http://localhost:5190` in API `CORS_ORIGINS` and the public Mapbox token URL list:

```bash
TEST_API_URL=http://127.0.0.1:13065 node frontend/test/deployment.browser.mjs
```

It uses the same installed Playwright, builds to a temporary directory and checks
real browser CORS/preflights, API/SQL, flags and Mapbox at 1440/390/320px. Its held
390px read continues to the real API; the first 320px GET fails before a real
retry. This opt-in command is distinct from fixture suites and the isolated
PostgreSQL integration tests above. It verifies a local production build over
HTTP, not live hosting/HTTPS or a sleeping provider.
