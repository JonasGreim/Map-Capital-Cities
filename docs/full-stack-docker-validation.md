# Full-stack Docker validation

## Default Compose startup — PR #52 follow-up

Checked on **26 October 2026**, following the README layout commits. The full-stack
file is renamed byte-for-byte from `compose.full.yaml` to `compose.yaml`;
`docker-compose.yml`, all Dockerfiles, services, health checks and volumes are
unchanged. `npm run db` now explicitly uses `-f docker-compose.yml`. The original
Issue #35 evidence below describes the earlier filename and remains historical.
Current operation is documented in [Development](development.md#full-stack-docker-demo).

A fresh export of the staged tree and its own Node **24.22.1** / npm **11.19.1**
installation were used. Local credentials were supplied only through an ignored
root `.env`; no values were printed. Tests used new Compose projects
`map-capitals-issue52-fresh` and `map-capitals-issue52-dev`, with separate new volumes.

| Check | Actual result |
| --- | --- |
| Default file discovery | Exact `docker compose up -d`, without `-f` or `--build`, selected `compose.yaml`, built the missing local app images and started db/api/frontend. This Compose 2.3.3 client warns about both supported filenames; it selects the full-stack file without merging them. |
| Browser origin / real services | Frontend HTML, `/health` and `/capital` passed on the normal port **8080**; the real startup import inserted **248** capitals into fresh PostgreSQL. |
| API and persistence | POST through Nginx returned 201 for one synthetic probe in the isolated demo. `docker compose down` retained the volume; `up -d` restored the same probe, ID and response. No reset or existing data mutation. |
| DB-only npm command | Actual `npm run db` started only the development `db` service under its own project. In the test copy only, its host port was changed from occupied 5432 to **55452**; the repository's DB-only file is byte-for-byte unchanged. |
| Development regression | Actual `npm run dev` in the fresh installation used that separate DB and completed a real 248-capital import. API health/list, frontend HTML and Vite proxy passed on **3052/5174**, because ordinary 3001/5173 were occupied. The npm dev script is unchanged. |
| Existing database isolation | Effective DB-only configuration still resolves to `fullstack-test-template_pgdata` for the original project directory. The original running DB container ID, start time and mounts were unchanged; all ten pre-existing volumes remain present. No command wrote to or deleted an existing volume. |
| Cleanup | Own dev processes and both test stacks stopped. Both new test volumes, including the persistence probe, remain; no volume was deleted. |
| Project checks | `npm ci` in the fresh export, `npm run check`, `npm test` and `git diff --check` passed. 135 tests passed; 2 optional PostgreSQL suites skipped. The live checks above independently exercised real PostgreSQL. |

The first persistence harness included Compose's filename warnings in parsed service
output and stopped before creating its probe. Separating stderr corrected the
harness; the complete persistence test then passed. No service configuration fix
or relaxed application assertion was needed.

This is a focused startup/HTTP/persistence regression, not a new full browser,
physical-device or production-deployment certification. Existing development-tool
advisories and the Vite bundle warning remain. No generated artifacts were committed.

## Original optional Docker implementation — Issue #35

Checked on **26 October 2026** from GitHub `main`
`76b0516ba0ac6c0758b76a7bc894e3c7c70a46ec` (includes #48 and #49).
Read the live issue, #47 and its comment, local assignment PDF and setup code.
The HTTPS CLI credential was invalid and SSH was unavailable; the connected
GitHub API verified the base. Its signed commit was imported locally only after
reconstructing and matching the exact Git object SHA; its tree already existed
locally. Implementation and `npm ci` used an isolated worktree and installation.

## Architecture and isolation

- `compose.full.yaml` is independent of the existing DB-only/devcontainer files.
  The default project is `map-capitals-demo`; its persistent `demo-pgdata` volume
  is project-scoped. Tests used **`map-capitals-issue35-20261026`**, including
  after container removal/recreation. No existing development volume was mounted,
  reset, deleted or used for CRUD/reset tests.
- PostgreSQL 16 initializes from the unchanged `db/schema.sql` once. The API uses
  `db:5432`, port 3001 and the existing compiled workspace start command. Only
  Nginx's 8080 is published on host loopback. The default npm ports are unchanged.
- Backend and frontend multi-stage builds use Node **24.22.1**, npm **11.19.1**,
  root lockfile and workspace-scoped `npm ci`. Backend runtime omits development
  dependencies and includes the existing reset snapshot. Nginx serves static
  assets with temporary paths writable by its non-root user. Runtime identities
  were confirmed: API UID 1000 and Nginx UID 101.
- Only the public Mapbox token is a frontend build argument. The private REST
  Countries key is supplied solely to the backend at runtime. Build contexts use
  an allowlist excluding `.env`, Git, PDF, tests, screenshots and generated state.
  A check using the actual local credentials found neither credential in source,
  and no private key in served static files, image metadata or build history.
  This is a scoped check, not an exhaustive image/security audit.

## Actual checks

| Check | Observed result |
| --- | --- |
| Effective Compose configuration | `config --quiet` passed. Captured configuration confirmed exactly three services, no API/DB host ports and only the public frontend build argument. Expanded secrets were never printed. |
| Missing environment values | Empty `RESTCOUNTRIES_API_KEY` and `VITE_MAPBOX_TOKEN` each failed Compose validation with setup guidance. |
| Real image builds and startup | Passed on Linux amd64, Docker Engine 29.8.2 / Compose 2.3.3; PostgreSQL, API and frontend all healthy. |
| Real REST Countries v5 import | Three pages, 254 fetched, 5 invalid skipped, 1 existing/duplicate conflict, 248 inserted into the fresh isolated DB. Later imports skipped existing rows. Counts are a snapshot. |
| Public-origin HTTP | HTML, `GET /health` with `{"ok":true}`, `GET /capital`, query-string forwarding and case-insensitive `GET /capital/berlin` returned 200 through Nginx. |
| CRUD over Nginx | POST 201, case-insensitive read 200, PUT 200 with changed coordinates, DELETE 204, then missing read 404. Only uniquely named smoke rows in the isolated demo DB were changed. |
| API errors and reset routing | Validation 400, missing row 404 and duplicate conflict 409 preserved. `POST /capital-reset` with `{"confirm":false}` returned the API's 400 JSON; row count unchanged. No successful reset was needed or executed. |
| Persistence | Created a separate smoke row, ran `down` without volume deletion, then `up --build -d`. The row, ID and response fields were unchanged. Deleted only that row after verification. |
| Slow database | Test-only override delayed the DB entry point by 12 seconds. Observed DB `starting` while API/frontend remained `created`; after `pg_isready`, API imported and all three services became healthy. |
| Missing runtime API key | A separate container using the actual backend image and demo network exited 1: `RESTCOUNTRIES_API_KEY is required; import not started`; no successful commit. |
| Failed import | An intentionally invalid key caused a real REST Countries HTTP 401. Backend exited 1 before opening HTTP; no successful commit. |
| API outage/recreation | Stopped only the API: public `/capital` returned 502. Recreated API, completed real import, then public health/list returned 200 and 248 rows. Nginx's original container remained running. |
| npm DB regression | Actual `npm run db` in the original repository succeeded and reported only existing `fullstack-test-template-db-1` running. No development data was changed. |
| npm dev regression | Actual `npm run dev` in the separate installation loaded root credentials, imported 248 rows into a separate tmpfs PostgreSQL on host 55435, and served health/API on 3001 and Vite HTML/proxied data on 5173. Own dev processes were stopped after the check. |
| Static regression | DB-only Compose, devcontainer Compose, all package manifests/lockfile, application code and Vite configuration are byte-for-byte unchanged from the base. |
| Project checks | `npm ci`, `npm run check`, `npm test`, `git diff --check` passed. 135 tests passed; 2 optional PostgreSQL tests skipped without `TEST_DATABASE_URL`. The real Docker HTTP/CRUD tests above independently used PostgreSQL. |
| Dependency audit | Existing Vite high and esbuild moderate findings; 0 production findings. No package upgrade or audit fix. |

The initial build exposed a missing `db/default-capitals.json` runtime asset and
Nginx's default root-owned temporary directories; both were fixed and real
startup was repeated successfully. This old Compose client also reused an
exited container after an image rebuild; `--force-recreate` replaced it. The
documented rebuild command includes that flag. A subsequent `down` / documented
`up --build -d` started the corrected images successfully from new containers.
Compose's one-off attached `run --rm` produced no usable diagnostics on this
client; runtime key failures were therefore tested with explicit `docker run`
containers using the same image/network, with exit codes and container logs.

## Browser evidence

Isolated Playwright Chromium against **http://localhost:8080**, using the real
Docker API/database, public Mapbox token, Mapbox resources and flag CDN; no
capital API mocks or authenticated browser profile:

- React and real map tiles loaded; 248 square 32×32 markers and 244 flag images
  loaded. No application JavaScript exceptions were observed in the checked flow.
- Selected Berlin from the desktop list: popup showed country, coordinates,
  metadata and flag over the rendered map. Changed Paris's marker to Purple.
- At 390×844, switched to Capitals and selected Paris: the app returned to Map
  with the Paris popup and retained one canvas. At 320×568 the popup/color state
  remained available; no horizontal page overflow at either mobile width.
- Desktop 1440×900 and mobile screenshots were captured outside Git; the desktop
  map/popup screenshot was visually inspected. Four browser warnings were
  reported; this was a focused startup/interaction smoke check, not a full
  browser-regression run or physical-device test.

## Limits and ongoing behavior

No production/TLS/deployment work, app refactor, dependency additions, schema
migration or automatic reset. External REST Countries, Mapbox and CDN/network
availability remain required. Startup still imports on every backend restart;
matching local edits survive, deleted imported records can reappear. No retry
loop was added; correct a failure and start again. During an API outage, a
running frontend can return proxy errors until the API recovers and the user
retries. Health failure does not itself restart containers.

Validation was on this Linux amd64 Docker host, not Docker Desktop, ARM or every
external timeout/quota scenario. A real HTTP 401 tested import failure; existing
unit tests cover other import errors. No new permanent test framework or browser
artifact was committed. CI for the actual PR head is recorded in the PR/checks;
local checks alone do not establish GitHub CI success.
