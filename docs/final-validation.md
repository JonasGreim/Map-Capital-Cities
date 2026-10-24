# Final validation — Issue #7

Independently checked on **24 October 2026**, against verified `origin/main`
`5021bbff6ebd29927c0868ba3961eb5dc2f54c32`, the live issue (no comments), README
and both pages of the local assignment PDF. This report records new verification,
not results inherited from earlier PRs. No release-blocking defect was found;
application code, dependencies and test infrastructure required no changes.

## Mandatory assignment checklist

| Requirement | Implementation | Independent verification | Result / limits |
| --- | --- | --- | --- |
| React/TypeScript, Node/TypeScript, Mapbox; recommended Zustand | Workspace manifests; `frontend/src/{App,Map}.tsx`, `capital-store.ts`; Fastify backend | Clean installation, typecheck, production build, running browser | Pass |
| SQL schema runs automatically on first DB start; generated ID and unique name/country | `db/schema.sql`; both Compose schema mounts | Two fresh PostgreSQL 16.15 containers; table/index exist before backend startup; SQL reapplied safely; real constraint suite | Pass; existing incompatible tables are not migrated |
| Paginated REST Countries v5 startup import with first-capital mapping | `backend/src/{index,import-capitals}.ts` | Two real fresh imports: 3 pages, 254 records, 248 inserted, 5 invalid skipped, 1 unique conflict each; mocked authentication/pagination/failure tests | Pass; counts are a snapshot, not a fixed expected country total |
| Five CRUD endpoints; case-insensitive name lookup; model-shaped JSON | `backend/src/{capital-routes,capitals}.ts` | Real PostgreSQL suite and live HTTP GET/list/POST/PUT/DELETE: 200/201/204, 400 validation/bounds, 404 missing records, 409 conflicts; failed writes preserve rows | Pass; optional frontend CRUD is separate |
| Country/capital list beside map | `frontend/src/{App,CapitalList,Map}.tsx`, `capital-store.ts`, `api.ts` | All 248 rendered pairs equal the live API, in API order; real Vite proxy; loaded Mapbox tiles | Pass; list and map stack at mobile widths |
| One square 32×32 marker per capital; click popup changes its color | `frontend/src/capital-markers.ts`, `styles.css` | 248 markers; every computed width/height 32px and radius 0; every Mapbox coordinate matches API within 1e-9 degrees; mouse popup, independent colors, reopening and reload checked | Pass; world-view overlaps/globe occlusion and in-memory colors are documented |

The PDF's priority table explicitly makes adding/editing/deleting cities in the
UI and removing them from list/map **nice to have**. Issue #6 remains separate.

## Fresh setup and PostgreSQL evidence

- Used Node **24.22.1** / npm **11.19.1**. `npm ci` passed both in the working
  checkout and a fresh local clone of the verified main commit in `/tmp`.
- Configured the fresh clone's ignored root `.env` from `.env.example`, with
  locally available API credentials. `npm run dev` started both workspaces;
  successful startup confirms root environment loading and readiness/import order.
- Exercised both root and devcontainer **database** Compose definitions using
  isolated copies with only test port/storage/schema-path substitutions. PostgreSQL
  used tmpfs, ports **55432/55433**, unique projects, and the repository's actual
  initialization SQL. Both auto-created an empty schema; reapplication passed.
  The complete devcontainer application image/post-create flow was not rebuilt.
- The normal development container/volume on **5432** was never modified. The
  documented API port **3001** was exercised. The fresh clone used **3002** from
  its root `.env`; its Vite `/capital` proxy returned exactly the corresponding API
  data. **5173** was already occupied, so validation Vite instances selected
  **5174/5175**. This is normal Vite fallback behavior.
- The real importer completed before either backend listened. Mocked external API
  tests additionally cover short/full metadata pages, offsets, malformed records,
  failed later pages, bounded pagination and transaction failures without secrets.
- Real PostgreSQL tests cover schema constraints, repeated imports, preserved local
  edits, deletion/reimport, atomic rollback and CRUD persistence. Live HTTP checks
  also verified safe `{"error":"Internal server error"}` responses from all five
  routes while only a disposable table was temporarily renamed, then restored.
- `/health` returned 200 with `{"ok":true}`. Pausing only the disposable database
  made it return 500; the container was then unpaused. Mocks alone were not used
  as evidence of PostgreSQL integration.

## Browser evidence

Isolated Playwright Chromium **156.0.8078.47**, real Fastify/PostgreSQL, real
REST Countries data, and a working local Mapbox public token:

- Desktop **1440×1000**, mobile **390×844**, narrow **320×844** screenshots inspected.
  No horizontal page overflow; bounded list scrolls with the keyboard; canvas
  matches map panel dimensions; popup/select remain inside narrow viewports.
- Map tiles loaded. Marker mouse click, Enter/Space activation, focused color
  control, Escape and close-button behavior passed. Escape restored marker focus.
  Two markers retained different colors; reopening preserved the chosen color.
- Store reload preserved all marker DOM elements, colors, canvas, center and zoom;
  marker count remained 248. Actual mouse wheel zoom and drag changed the map view.
- Browser interception exercised loading, empty and HTTP 503 states without
  deleting DB records. Empty data removed markers. Failed keyboard retry returned
  focus to retry; successful retry restored 248 records/markers and focused results,
  keeping the same map canvas. Fresh navigation made one initial capital request.
- No application JavaScript exceptions or failed Mapbox requests in the normal
  checked flow. One initial missing `/favicon.ico` 404 was cosmetic; deliberately
  injected 503 responses were expected. No cosmetic favicon work was added.

For coordinate/canvas inspection only, a browser-intercepted module exposed the
live Mapbox instance to the test page; store reloads used the existing dev module.
No debug hooks, browser files, credentials or screenshots were added to the source.
The fresh clone was also checked without that interception. This was desktop
Chromium at mobile viewport sizes, not a physical touch-device or Firefox test.

## Automated checks and CI

| Command | Actual result |
| --- | --- |
| `npm ci` | Pass, including separate fresh clone |
| `npm run lint` | Pass |
| `npm run typecheck` | Pass |
| `npm run build` | Pass |
| `npm run check` | Pass |
| `npm test` | 51 pass; 1 PostgreSQL opt-in test skipped as designed |
| `TEST_DATABASE_URL=… npm test` (disposable PostgreSQL 16) | 57 pass, 0 skipped, including integration subtests |
| `git diff --check` | Pass |
| `npm audit` | 2 affected development packages: Vite high, esbuild moderate |
| `npm audit --omit=dev` | 0 reported vulnerabilities |

Reviewed `.github/workflows/ci.yml`: pinned Node/npm, `npm ci`, `npm run check`
and `npm test`, read-only contents permission, no private keys or external service
requirement. Default CI uses mocks and skips PostgreSQL integration by design.
The actual new PR head's Actions result must be assessed separately from these
local results; see the PR checks. Pending CI is not a passing result.

Builds warn about the existing Mapbox-containing bundle exceeding 500 kB.
Installation warns that ESLint 9 is deprecated and reports esbuild install scripts.
These did not fail installation/checks; dependency upgrades and code splitting
were deferred under the feature freeze.

## Security, documentation and remaining limitations

- Tracked files and available local Git history were scanned for credential
  patterns, actual local API credentials and forbidden artifact paths: no matches.
  `.env` and the assignment PDF remain ignored/untracked; generated builds,
  screenshots and browser sessions are excluded. This is a scoped scan, not a
  guarantee about every possible secret format.
- Existing Vite/esbuild development-server advisories remain. See the maintainers'
  [Vite advisory](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)
  and [esbuild advisory](https://github.com/evanw/esbuild/security/advisories/GHSA-67mh-4wv8-2f99).
  `npm audit` aggregates additional Vite advisories. Vite is configured to bind all
  interfaces: use trusted networks or `npm run dev -w frontend -- --host 127.0.0.1`
  for local browser verification. These packages are development tools; the
  production-only dependency audit is clean. No major upgrade or forced fix ran.
- README already accurately describes all five API examples, first-run SQL and
  existing-volume setup, ports, import/restart behavior, Zustand/proxy flow,
  markers, testing and submission. Only the production audit result, development
  network caveat and link to this report were added.
- Known functional limits: every backend restart requires REST Countries and can
  restore deleted imported capitals; changing both unique keys can reimport the
  original; only the first capital is used and invalid/unique-conflicting records
  are skipped. Colors reset on page reload/map unmount. Mapbox requires its token
  and network. Static production hosting must route `/capital` to Fastify; Vite
  preview does not proxy it. The CRUD API has no authentication and is intended
  for this local assignment setup.
- No confirmed P0 blocker. Frontend CRUD, clustering, search/filtering, persistent
  colors, visual redesign and optional UI-audit tooling were intentionally deferred.

## Manual submission checklist

- [ ] Review this report and the open PR; confirm CI passes for its actual head.
- [ ] Decide whether to merge after review; no automatic merge is enabled.
- [ ] Confirm reviewer identity and invite that reviewer to the private repository,
  or prepare a ZIP without `node_modules`, credentials, build/browser artifacts
  or the private assignment PDF. Repository visibility was verified private;
  permissions and invitations were not changed.
- [ ] Provide setup instructions and tell the reviewer to configure their own
  REST Countries key and Mapbox public token; do not send the local `.env`.
- [ ] Submit the reviewed solution by **Sunday, 25 October 2026, evening**.
  Invitation, visibility changes and submission remain manual user actions.
