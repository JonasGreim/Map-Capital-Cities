# Final acceptance — Issue #62

**26 October 2026 · Ready for the local reviewer demo, subject to PR review/CI
and the manual handoff below.** No functional submission blocker was reproduced.
This is acceptance evidence for the tested environment, not a production or
assistive-technology certification. No application code or dependency changed.

## Environment and strategy

- Tested application commit: **`cdc88e3317a9bd18d23891e3f0aa1bf8ece9239a`**,
  verified as live `main` through the connected GitHub API. Prerequisites #58
  and #61 merged in [#66](https://github.com/JonasGreim/Map-Capital-Cities/pull/66)
  and [#67](https://github.com/JonasGreim/Map-Capital-Cities/pull/67). #62 had no
  comments; no open PR overlapped this work. The local assignment PDF was readable.
- Node **24.22.1**, npm **11.19.1**, Docker Engine **29.8.2**, Compose **2.3.3**,
  PostgreSQL **16.15** (`postgres:16`). Separate clone and physical `npm ci`
  installation at `/tmp/map-capitals-final-qa-62`; original checkout untouched.
- Isolated headless Chromium **156.0.8078.4** with software WebGL, and Firefox
  **157.0** smoke test. Existing external Playwright tooling supplied through
  `PLAYWRIGHT_MODULE`; no browser dependency added to the project.
- Strategy: locked install/static checks → PostgreSQL-enabled automated tests →
  every existing browser suite → real production-stack browser/API/DB acceptance,
  restart and outage recovery → genuine screenshots and documentation verification.

### Database protection and reproduction

All writes/reset/negative cases used Compose project **`map-capitals-final-qa-62`**,
fresh volume **`map-capitals-final-qa-62_demo-pgdata`**, browser port **8086** and
loopback DB port **55462**. Container project labels, volume mount, current database
and port were checked before writes. Development ports 5173/3001/5432 and the
development database/volume were neither stopped nor written. No existing volume
was deleted. Only this run's containers/network were removed after acceptance;
its volume was retained. Temporary evidence/harnesses remain outside tracked files.

Use free ports and a new project name when repeating. Local credentials are
required as described in [development](development.md#full-stack-docker-demo).
The untracked override used for these checks was:

```yaml
services:
  db:
    ports:
      - "127.0.0.1:55462:5432"
```

From the isolated checkout, with that override at `/tmp/issue62-compose.override.yaml`:

```bash
npm ci
npm run check
DEMO_PORT=8086 docker compose -p map-capitals-final-qa-62 -f compose.yaml -f /tmp/issue62-compose.override.yaml up --build -d
TEST_DATABASE_URL="$QA_TEST_DATABASE_URL" npm test
git diff --check
```

Set `QA_TEST_DATABASE_URL` locally to the verified disposable DB at port 55462,
following [testing](testing.md#isolated-postgresql-integration); never copy a
development connection into this variable or logs. Both PostgreSQL suites create
unique temporary schemas, then remove their own schemas. They never use the development `DATABASE_URL`. Use the existing
[browser runner instructions](testing.md#browser-runner-and-ci-prerequisite);
capital fixtures in that runner are intercepted even when Mapbox is real.

## Results

| Area | Result | Actual evidence |
| --- | --- | --- |
| Build / lint / typecheck | PASS | `npm ci`, `npm run check`, `git diff --check`; both workspace app/test configurations and production builds. |
| Automated tests | PASS | **153 passed, 0 failed, 0 skipped**: backend 61, frontend unit 90, Vite branding HTTP 2. |
| PostgreSQL integration | PASS | Both optional suites executed: schema/id/required fields/bounds/unique constraints, transactional import, repeat import/local edits/deletion/reimport, CRUD/health/metadata; reset/repeat/new IDs/rollback/concurrent-writer timeout. Import responses in these suites are mocked. |
| Fullstack Docker | PASS | Fresh PostgreSQL schema initialization → real startup import → healthy Fastify → healthy Nginx; HTML, `/health`, `/capital` and production-browser API communication. |
| REST Countries | PASS | Live v5: **3 pages, 254 fetched, 5 invalid skipped, 1 conflict skipped, 248 inserted**. These are observations, not a fixed upstream-count guarantee. |
| CRUD | PASS | Real desktop and 390/320px UI create/edit/coordinate change/delete, checked in API and PostgreSQL; old name/deleted record 404, blank/range validation and real duplicate-name 409 with retained draft. |
| Reset | PASS | Real dialog has three consequences and shared-data/browser-color warning; Cancel/Escape preserve rows; confirmed isolated reset restores 248 snapshot records with new IDs and clears browser color overrides. |
| Mapbox / markers | PASS | Real styles/tiles/flags, 248 square 32×32 markers, list selection/popup/country facts, retained colors after reload; existing suites cover pan/zoom, controls, camera-only reset, identity and controlled map failures. |
| Desktop | PASS | Live 1440/1024/701px, expanded/collapsed sidebar, selection/filter/layout; suites additionally check shortcut search, rail, short viewport and retained scroll/state. |
| Mobile | PASS | Live 390/320px CRUD/picker/tab flows, 700/701px crossing and 200% root text without horizontal overflow; suites add short landscape, simulated keyboard viewport and popup/attribution geometry. |
| Accessibility | PASS (scoped) | Browser roles/names, keyboard, visible focus, modal/popup/combobox focus and dismissal, enlarged root text and touch emulation. Screenreader and physical-device checks **NOT TESTED**. |
| Error recovery | PASS | Actual stopped QA API produces Nginx **504**; UI error/Try again recovers after API restart. Mocked browser suites cover slow/empty/failed requests, failed save/delete/reset, flag failure and Mapbox resource/WebGL errors. |
| Firefox smoke | PASS (scoped) | Real production list/search, combobox keyboard, modal Escape/focus return, mobile tab/state/overflow; 248 markers constructed, no page errors. Full browser suite was Chromium only. |
| README images / local rendering | PASS | Three real production-app PNGs; desktop 1440×900, mobile 390×844; reviewed visually, loaded flags/tiles/fonts, readable Paris popup and attribution, no test records or errors. All 74 local references and a responsive preview checked; all 19 public external documentation links returned HTTP 200. |

### Existing browser suites: real Mapbox, mocked capital API

All **20 passed**, with no assertions removed or application test hooks added:
`map-navigation`, `sidebar-controls`, `sidebar-rail`, `mobile-responsive`,
`mobile-navigation`, `toast`, `coordinate-picker`, `marker-colors`, `branding`,
`flags`, `selection`, `sidebar`, `reset`, `continents`, `sidebar-polish`,
`popup-actions`, `map-errors-success`, `map-errors-construction-error`,
`map-errors-initial-style-error`, `map-errors-no-token`.

The initial runner completed seven suites, then a Chromium target crashed while
the runner attempted to capture the next suite's failure state. The remaining
13 suites passed in a fresh runner/browser (exit 0). This is **not** a claim that
one uninterrupted 20-suite invocation passed. Initially the cached Playwright
module also expected a different browser revision; specifying the installed
Chromium executable resolved launch. No cause for the target crash was proven.
These fixtures establish browser behavior, not PostgreSQL or live CRUD.

### Real production acceptance and restart behavior

The additional browser run used **no API interception** and the actual Nginx →
Fastify → PostgreSQL chain with local REST Countries/Mapbox credentials. UI writes
were verified through HTTP and SQL; coordinate picking/Cancel/Escape changed no
rows. Desktop and mobile CRUD passed, as did color persistence and confirmed reset.
Normal operation and screenshot capture had **zero console/page errors**. The
deliberately induced 409 and outage errors were recorded separately.

A full `down` / `up -d` retained a manual row's ID and an edited imported row's
coordinates. A previously deleted Paris returned with a new ID on startup import;
the total became 249 because the manual row survived. Removing the disposable row
and restoring the local edit returned the clean dataset to 248. Further API starts
inserted no duplicate records. Reset restores the checked-in snapshot, whereas
startup import follows the live source; these are separate operations.

Real outage recovery stopped only the QA API, then restarted it and retried from
the UI. The observed proxy response was 504 after its upstream timeout; an
unavailable API can also produce 502 during startup. No shared network, development
service, external API or development DB was damaged to induce failures.

## Limits and handoff

- **Manual visual review:** all three curated screenshots were inspected for
  readable popup/list/controls, loaded map/flags, selected row, attribution and
  absence of private/test data. Functional flows above were browser-driven
  automation, not human device or screenreader sessions.
- **NOT TESTED:** physical iOS/Android/touch/pinch and on-screen keyboard behavior,
  assistive-technology announcements, native browser 200% page zoom (tests used
  200% root text), Safari, full Firefox regression matrix, exhaustive load/race or
  security testing. No public deployment was requested.
- `npm audit`: **2 affected development packages** (Vite high, esbuild moderate).
  `npm audit --omit=dev`: **0 vulnerabilities**. Existing ESLint support warning,
  Vite bundle-size warning and npm esbuild install-script notices remain; builds
  passed. No force-fix, dependency migration or future feature was included.
- Startup still depends on REST Countries availability and repeats the import;
  deleted imported records can return. Marker colors are local to each browser;
  reset changes shared demo records. These documented policies remain unchanged.
- CLI authentication cannot access this private repository. GitHub connector
  verifies/publishes the PR. Private GitHub README/badge rendering and reviewer
  access require an authorized human check; local rendering cannot prove them.
- PR-head CI is checked separately when publishing; local results do not replace
  CI. Review and merge remain manual. Give reviewers the compact README and their
  own two credentials; exclude `.env`, the assignment PDF and generated state.

Functionality, reliability and reproducible local startup passed within this
matrix; the existing focused architecture and documentation are suitable for the
assignment. No new features or broad refactors were justified. Dark mode #63,
internationalization #64 and deployment #65 remain deferred.
