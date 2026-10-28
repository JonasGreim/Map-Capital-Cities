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

## Frontend and browser verification

The header brand is a native home link to `/`; it reloads the app and restores its
initial state. Its globe uses a short hover/focus scale transition, disabled by
reduced-motion preferences. The tab title is **Map Capital Cities** and the public
SVG favicon reuses the header globe with thicker strokes for small sizes.
`branding.test.ts` checks the document and favicon over HTTP in Vite dev and a
temporary production build/preview. Dev closes before build/preview starts, each
phase owns its cleanup, and Vite's own server `close()` APIs release sockets and
process listeners. The dev HTTP test uses a fresh temporary cache and disables
speculative JS transforms and dependency optimization only in that test: it reads
HTML/SVG and never executes application JS. This avoids a cold-cache shutdown
race where the plugin container waits on transforms waiting on the optimizer.
The application Vite config remains unchanged.
`branding.browser.mjs` verifies SVG decoding,
title, native mouse/keyboard navigation, focus, motion and layout at the three
standard viewport sizes. It runs in the existing browser runner and can also run
against production preview or an isolated Firefox Page via `verifyBranding`.

`npm test -w frontend` covers the API contract and failures, request sharing,
loading/error transitions, retry/reload and the rendered list states. Marker tests
use small DOM/Mapbox doubles to cover coordinates, square CSS dimensions, popup
context, independent colors, reopening, selection/controller navigation, reduced
motion, data updates, removal and cleanup. These
unit tests do not establish database, native keyboard or browser integration.

For a real browser check after backend startup (mobile list actions use the Capitals tab):

1. Open the frontend in Chrome/Chromium and compare the country/capital pairs
   with `curl -s http://localhost:3001/capital`. Reload and verify a single
   browser `/capital` request and a working, zoomable Mapbox map.
2. Inspect desktop and narrow (for example, 390px and 320px) layouts: scroll the
   list, check that the map resizes and that no horizontal page scrolling is needed.
3. With Playwright request interception, hold `/capital` to inspect loading,
   fulfill it with `[]` for empty, or return HTTP 503 for error. Remove the error
   interception, focus “Try again” and press Enter: real records should return
   without replacing the map canvas. Do not delete development data to test empty.
4. Open different marker popups (mouse and keyboard), change their colors, close
   and reopen them. Check independent colors, 32×32 square dimensions, focus and
   Escape. Reload capital data through the store and check unchanged markers,
   colors, canvas and map view. Verify zoom/drag, nearby capitals and narrow-screen
   popups. A full page reload should preserve saved colors.
5. Inspect browser console errors. An intentionally mocked HTTP failure is
   expected during the error check; normal loading should have no errors.

`frontend/test/sidebar-controls.browser.mjs` verifies the Variant B controls at
1440px, 1024px, 701px, 390px and 320px, including 200% root text. It exercises all
eight icon/label choices, keyboard navigation and typeahead, Escape/Tab/outside
closing, touch selection, focus, popup bounds, search/clear, existing Add/Reset
dialogs and retained search/filter/map nodes across collapse or mobile tabs.
Run with `BROWSER_SUITES=sidebar-controls` through the runner below;
`BROWSER_SCREENSHOT_DIR` captures the controls, dropdown and enlarged-text states.
All capital traffic is mocked; no backend or database is started. Accessibility
roles and focus are checked in the browser; assistive-technology announcements
and physical-device behavior still need manual verification.

`frontend/test/sidebar-rail.browser.mjs` verifies the desktop header relocation,
64px shortcut rail, shared list/popover search, direct Add dialog, flag navigation,
Escape/outside-click/Tab focus, repeated toggles and retained list scroll, filter,
selection, marker colors and canvas/marker identity. It measures API-read and
Mapbox-construction counts at 1440px, 1024px, 701px and 1024×360, then checks the
unchanged mobile header/tabs at 390px and 320px. Run with
`BROWSER_SUITES=sidebar-rail` through the runner below; `BROWSER_SCREENSHOT_DIR`
captures expanded/collapsed/search desktop and mobile states outside the repo.
All capital traffic is mocked; Mapbox uses the real browser and network.

`frontend/test/sidebar.browser.mjs` exports `verifySidebar(page, baseURL)` for an
isolated Playwright Page. With the frontend running and Playwright supplied by the
browser tooling, run `await verifySidebar(page, "http://127.0.0.1:5173")` (use the
actual Vite port). It intercepts **all** capital reads/writes with controlled
fixtures and exercises 1440px, 390px and 320px layouts, sidebar/search state,
keyboard menus/dialogs, pending/conflict CRUD, loading/error/retry/empty states,
canvas identity, marker dimensions and overflow. It requires a working Mapbox
public token/network to verify the real canvas. This browser suite is separate
from `npm test`; no Playwright project dependency is installed.

`frontend/test/map-selection.browser.mjs` exports
`verifyMapSelection(page, baseURL, screenshotDirectory?)` for another fresh isolated
Playwright Page. It mocks all capital reads/writes and uses the real Mapbox map at
1440×900, 390×844 and 320×568. It verifies list/marker selection, correct navigation,
interrupted/repeated flights, popup bounds/focus/Escape, named swatches, search and
closed-sidebar behavior, actions without navigation, selected edits/deletion,
refresh/color persistence, pan/zoom, reduced motion, 32×32 markers, retained
canvas/marker objects, overflow and console errors. The optional screenshot
directory must exist and should be outside the repository. Both browser fixtures
are separate from CI and require a local frontend, Playwright tooling and Mapbox
network access; their API mocks do not establish PostgreSQL integration.

`frontend/test/map-navigation.browser.mjs` checks the top-right zoom group and
separate camera reset at 1440px/1024px (expanded and collapsed sidebar) and
390px/320px (mobile Map/Capitals tabs). It covers rapid clicks, zoom limits,
Tab/Enter/Space, focus/hover, wheel/canvas keyboard navigation, reduced motion,
and resetting pan/zoom/bearing/pitch after capital selection. Assertions retain
the complete store object, popup, marker/canvas identities, colors, search,
continent, style/projection and capital request count. Picking hides/disables the
controls and retains its cursor, coordinates and form draft on selection/cancel.
Popups use a narrower layout below 361px so their close/actions remain clear of
the top-right controls; the existing selection suite exercises the close button.
Run with `BROWSER_SUITES=map-navigation` and optionally `BROWSER_SCREENSHOT_DIR`
through the runner below. Every capital request uses fixtures; Mapbox is real.
The map-error suites additionally verify unavailable/disabled navigation during
construction failure, initial style failure and WebGL loss/recovery, plus absent
controls without a token (`map-errors-no-token`). These browser checks are
separate from `npm test`; the latter includes server-rendered accessibility and
unavailable/picking control regressions. No development database is used.

`frontend/test/map-errors.browser.mjs` exports
`verifyMapErrors(page, baseURL, mode)` for a fresh isolated Playwright Page per mode
(`success`, `initial-style-error`, `construction-error`). It checks actual component
initialization, controlled resource errors, failed style-request recovery, real
WebGL loss/restoration, normal selection/zoom and listener cleanup on unmount.
Capital requests are mocked; browser-only Vite instrumentation exposes the map
and React root without adding a production debug API. Run it separately from
`npm test` with the same local frontend/Playwright/Mapbox prerequisites.

The isolated browser MCP tools configured in `.codex/config.toml` can run these
checks locally with the root `.env`. Browser checks remain separate from CI and
do not introduce private API keys or Mapbox credentials into GitHub Actions.

`frontend/test/flags.browser.mjs` exports `verifyFlags(page, baseURL,
screenshotDirectory?)` for a fresh isolated Playwright Page. It mocks all capital
CRUD, loads real German/Czech CDN images and Mapbox, and checks flags, neutral
fallbacks, a controlled image failure, country edits, manual creation/deletion,
popup focus/Escape, colors, fixed dimensions and overflow at 1440px, 390px and
320px. Controlled response gates verify the globe during initial loading and a
country change; completion checks wait for the specific image, including reuse
of an already loaded flag. Run it with the same prerequisites as the other suites.

The selection suite waits for the canvas to match its resized container and for
drag inertia to finish before starting the next viewport scenario. Instrumented
runs exposed flights starting with the previous canvas size (1088×805 inside a
390×464 container); arbitrary delays and relaxed camera assertions are not used.

`frontend/test/continents.browser.mjs` exercises the search/continent matrix,
custom combobox keyboard operation, excluded selection/focus, hidden-marker safety,
marker identity/color restoration, collapse/expand, CRUD and reset with an active
filter, stable camera/canvas, 32×32 markers and overflow at 1440×900, 390×844 and
320×568. It is included in `frontend/test/run-browser.mjs`; every capital API
request is mocked while Mapbox runs in a fresh Chromium context.

`frontend/test/sidebar-polish.browser.mjs` adds geometry checks for anchored menus
at list edges and long names, native keyboard/focus transitions, marker-selected
centering and clamping, independent search clear, three-second success timing,
timer restart/unmount cleanup and persistent failures. It runs at 1440×900,
390×844 and 320×568 through the same runner. Set `BROWSER_SCREENSHOT_DIR` to an
existing directory outside the repository to capture this suite's screenshots.

The `mobile-responsive` suite adds short-landscape popup bounds, long metadata,
edge/corner markers, focused swatch visibility, attribution hit targets, 200% root
text and simulated keyboard-space checks. See the [responsive QA report](mobile-responsive-qa.md)
for the matrix and limits; these checks do not establish physical-device behavior.

## Browser runner and CI prerequisite

For an opt-in production smoke, `frontend/test/deployment.browser.mjs` builds
static assets into a temporary directory and serves them on
`http://localhost:5190`, with `VITE_API_BASE_URL` compiled to `TEST_API_URL`.
It accepts only a loopback HTTP API and **performs CRUD and reset**: point it only
at a newly created disposable test database, never the development database.
Allow `http://localhost:5190` in that API's `CORS_ORIGINS` and in the public
Mapbox test token's allowed URLs. With the external Playwright module/executable
configured as below, run:

```bash
TEST_API_URL=http://127.0.0.1:13065 \
  PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs \
  node frontend/test/deployment.browser.mjs
```

This uses the real API, PostgreSQL, browser CORS/preflights, flags and Mapbox at
1440/390/320px. The 390px GET is held before continuing to the real API; the 320px
first GET has a controlled network failure followed by a real retry. It checks
configured URLs, country facts, CRUD/reset and clean page errors. It validates a
local production build over HTTP, **not** live Render hosting, HTTPS or idle wake-up.

The `loading` suite uses controlled GET responses and simulated time for the
5-second explanation and 120-second timeout. It checks fast/delayed success,
failure/retry, StrictMode request sharing, timer cleanup, keyboard, reduced motion
and unchanged layout at 320/390/1440px, with real Mapbox markers after success.

`frontend/test/marker-colors.browser.mjs` covers reload persistence, swatches,
filter/search/read stability, CRUD ID cleanup, confirmed/failed reset and blocked
storage at 1440×900, 390×844 and 320×568 with every capital request mocked.

`frontend/test/mobile-navigation.browser.mjs` adds the Variant B integration
regression: initial Map, keyboard tabs, hidden-pane focus exclusion, repeated
list selections after resize (including reduced motion), marker/list handoff,
search/filter/scroll/camera/color retention, API-read count, actual Mapbox creation
count and canvas/marker identity. It also covers mocked CRUD/errors/reset, picker
drafts/Cancel/Escape, focus, toast clearance and popup bounds at 1440×900,
768×1024, 700×844, 390×844, 320×568 and 667×375, plus crossing 700px both ways.
Existing suites now explicitly open the relevant mobile view instead of assuming
both panes are visible. Their desktop collapse/expand scenarios use Map/Capitals
on mobile; hidden DOM state assertions still inspect the mounted original nodes.
Set `BROWSER_SUITES=mobile-navigation,selection` to run selected suites, or omit it
for every suite. `BROWSER_SCREENSHOT_DIR` keeps screenshots outside the repository.

`frontend/test/run-browser.mjs` starts only Vite, awaits server readiness and runs
the mobile-responsive, mobile-navigation, toast, coordinate-picker, marker-color, branding, flag, selection, sidebar, reset, continent, sidebar-polish,
popup-actions and map-error suites in fresh Chromium
contexts. Every capital read/write is mocked; no backend or database is started.
The coordinate-picker suite checks create/edit, draft preservation, repeat picks,
Cancel/Escape and focus, failed saves, pan/zoom, sidebar collapse, context loss,
reset and unmount cleanup at 1440×900, 390×844 and 320×568.
The popup-actions suite covers expanded/collapsed sidebars at all three viewports,
keyboard and touch, long names/close-button geometry, shared edit/delete dialogs,
validation and HTTP/network failures, pending writes, focus recovery, filters,
stable camera/canvas/markers and listener cleanup on popup closure and unmount.
It fails on missing
Mapbox configuration or test errors and closes the browser/server on exit.
Use existing Playwright tooling via `PLAYWRIGHT_MODULE` (an absolute module path),
or install a pinned copy outside the project, without changing its dependencies:

```bash
# From the repository root, with the pinned Node/npm versions and npm ci complete.
# A valid public Mapbox token must already be in the root .env or environment.
browser_tools=$(mktemp -d)
npm install --prefix "$browser_tools" --no-save --package-lock=false playwright@1.62.1
node "$browser_tools/node_modules/playwright/cli.js" install --with-deps chromium
PLAYWRIGHT_MODULE="$browser_tools/node_modules/playwright/index.mjs" \
  node frontend/test/run-browser.mjs
```

The required CI check remains secret-free. Full browser CI is **not enabled**:
these existing suites need real Mapbox resources and the flag suite needs CDN
access. A suitable Actions secret could not be confirmed because the available
CLI identity cannot list this repository's Secrets (HTTP 404); that does not
establish whether a secret exists. No credentials were copied or configured.

The smallest next step is a separate, explicitly requested browser job after an
owner supplies `MAPBOX_PUBLIC_TEST_TOKEN`: a dedicated public `pk` token with
`styles:read` and `fonts:read`, permitted for `http://localhost:5188`. Mapbox URL
restrictions do not support IP addresses, so use the runner's localhost hostname.
See [Mapbox token scopes and URL restrictions](https://docs.mapbox.com/accounts/guides/tokens/).
Inject it only into that job through the environment:

```yaml
env:
  VITE_MAPBOX_TOKEN: ${{ secrets.MAPBOX_PUBLIC_TEST_TOKEN }}
```

Reuse the commands above on an Ubuntu runner with Chromium's OS dependencies,
read-only repository permissions and a job timeout. Start with a manually triggered,
trusted-ref workflow or an approval-protected environment; fail if its token is
absent. [Actions secrets](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)
are unavailable to fork/Dependabot PRs. Do not use `pull_request_target` to execute
untrusted PR code with a token. A Vite public token is visible in the test browser;
never use a secret `sk` token, print credentials, or upload served bundles, HARs
or traces containing token-bearing requests. External Mapbox/CDN availability and
usage limits remain prerequisites. Until configured, run this same runner locally;
the normal lint/build/unit CI remains independent of those services.
