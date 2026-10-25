# Full-Stack Test: Capital Cities

Design and implement an API and a UI to create, edit, view and delete capital cities.

## Stack

- Frontend: React + TypeScript, Zustand (recommended), Mapbox
- Backend: Node.js + TypeScript, Fastify 5, `@fastify/cors`, PostgreSQL `pg` pool
- Database: an SQL database of your choice (e.g. PostgreSQL, MySQL, SQLite or MongoDB)
- Everything else is up to you.

Starters are included: a Fastify backend in `backend/` and a Postgres container via Docker.
Use, modify or replace them, but keep the project easy to run and describe how in your submission.

## Run the starter

Use Node.js **24.22.1** and npm **11.19.1** (Docker only for the Postgres container). Get a
[REST Countries](https://restcountries.com) API key and a [Mapbox](https://account.mapbox.com) public token, then:

```bash
nvm install             # reads .nvmrc; nvm use for an existing installation
npm install --global npm@11.19.1
cp .env.example .env   # fill in RESTCOUNTRIES_API_KEY and VITE_MAPBOX_TOKEN
npm ci
npm run db             # Postgres on :5432; required for a successful /health
npm run dev            # UI http://localhost:5173, API http://localhost:3001 (GET /health -> {"ok":true})
```

The existing npm workspaces remain `backend` and `frontend`. Both load variables
from the root `.env`; never commit it. `GET /health` runs `select 1` through the
PostgreSQL pool before returning HTTP 200 and `{"ok":true}`. An unavailable DB
produces HTTP 500. The API defaults to port 3001 (`PORT` can override it).

No Docker or Node? Use a GitHub Codespace (Postgres included) and add both keys as Codespaces secrets.
The devcontainer setup installs the pinned Node/npm versions and runs `npm ci`.
Use `nvm use` in an already-open terminal after setup.

## Quality checks

```bash
npm run lint           # ESLint flat config, TypeScript, React and React Hooks rules
npm run typecheck      # both workspaces, including backend tests
npm run build          # backend TypeScript + frontend Vite production build
npm run check          # lint + typecheck + build
npm test               # backend tests plus frontend API, Zustand and list-state tests
git diff --check
```

CI runs `npm ci`, `npm run check` and `npm test` on PRs and main pushes,
using the pinned runtime without secrets or a database. Import tests mock REST
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

The [final validation report](docs/final-validation.md) records the independently
checked assignment requirements, fresh setup, live PostgreSQL/Mapbox results,
remaining limitations and manual submission checklist for Issue #7.

Repository Codex guidance is in `AGENTS.md`; use `$issue-work #N` for implementation
and `$pr-review #N` for a read-only review. `.codex/config.toml` contains pinned,
isolated Playwright and headless Chrome DevTools MCP servers, without an authenticated
profile. Their browser availability can be checked during UI work; they are not
required for the static checks above.

## Data

```json
{ "id": 1, "name": "string", "latitude": 0.0, "longitude": 0.0, "country": "string" }
```

`db/schema.sql` creates `capitals` with an automatically generated integer ID,
non-null/nonblank names and countries, latitude in [-90, 90] and longitude in
[-180, 180]. Capital names are unique case-insensitively (`lower(name)` index);
countries have an exact unique constraint.

Both Compose configurations mount this SQL file read-only into PostgreSQL's
`/docker-entrypoint-initdb.d/`. It runs automatically **only when the database
storage is first initialized**. Existing `pgdata` volumes and rows are preserved;
Docker does not rerun init scripts on them. For an existing starter database,
apply the schema once without resetting its volume:

```bash
docker compose exec -T db psql -U postgres -d capitals -v ON_ERROR_STOP=1 < db/schema.sql
# In a devcontainer, use: docker compose -f .devcontainer/docker-compose.yml exec ...
```

The script can be reapplied to this schema. It is not a migration framework and
does not repair an incompatible, manually created `capitals` table.

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
repeat imports, local edits, deletion/reimport, rollback, CRUD HTTP requests and DB-backed health,
then removes only that test schema. It never falls back to `DATABASE_URL` and
skips these integration checks when `TEST_DATABASE_URL` is unset. REST Countries
is still mocked; no real API key is needed. Real startup with a valid key should
log import counts before the API begins listening.

## Backend

On startup, import countries and capitals from [REST Countries](https://restcountries.com/docs) v5
(`country` = common name, `name` = capital):

```
GET https://api.restcountries.com/countries/v5
Authorization: Bearer <RESTCOUNTRIES_API_KEY>
```

`backend/src/import-capitals.ts` is independent of the server bootstrap. Startup
first checks PostgreSQL readiness (up to 10 attempts, 1 second between failures;
connections time out after 2 seconds and queries after 5 seconds), then imports,
then listens on port 3001. A missing key, unavailable DB, failed import or missing
schema aborts startup with a visible error and nonzero exit status. The root
`.env` is loaded before creating the pool; the API key remains server-side.

The importer requests `limit=100` and advances `offset` by the returned count.
It maps `data.objects`: `names.common` → country, `capitals[0].name` → name and
`capitals[0].coordinates.lat/lng` → coordinates. Text is trimmed; missing/blank
names, missing first capitals, nonnumeric/nonfinite or out-of-range coordinates
are skipped. Additional capitals are ignored as required by the assignment.

Pagination follows and validates `data.meta.total/count/limit/offset/more` from
the [v5 documentation](https://restcountries.com/docs/countries#pagination).
Without metadata it continues full pages until a short/empty page. Contradictory
metadata, stalled/repeated pages, changing totals, demo responses, invalid JSON
or envelopes, HTTP errors and network failures fail the import. Each request has
a 15-second timeout; a 100-page safety cap prevents an endless import. Failed
requests are not automatically retried; fix the error and restart the backend.

All pages are fetched and validated before opening a transaction. Parameterized
inserts use `ON CONFLICT DO NOTHING`; one transaction commits all valid records
or rolls back on a database error. A failed later API page causes no DB writes.
Success logs include pages, fetched records, skipped invalid records, conflicts
(`skippedExisting`, including duplicates within the API result) and inserted
records. Failure logs include the failing stage/offset and progress counts;
uncommitted inserts are never reported as imported.

**Current import policy and limitations:** REST Countries is queried on every
backend startup, even when local records already exist. Existing records retain
their local values when either unique key still matches: the case-insensitive
capital name or the exact country. **Deleted imported capitals can reappear after
a backend restart.** Changing both the capital name and country can also allow
the original record to be imported again, because neither unique key then matches.
Backend startup currently depends on REST Countries being available: a failed
request aborts startup before the API begins listening. These are limitations of
the agreed startup-import policy; no persistent completion marker or reset button
is implemented.

### Capital API

All capital objects have the shape shown in the Data section. The API uses JSON;
POST and PUT require `Content-Type: application/json`.

| Method | Path | Success response |
| --- | --- | --- |
| GET | `/capital` | 200, a plain array of all capitals (`[]` when empty), ordered by case-insensitive name then ID |
| GET | `/capital/:name` | 200, one capital matched by case-insensitive name; URL-encode the name |
| POST | `/capital` | 201, the created capital with its generated integer ID |
| PUT | `/capital/:id` | 200, the fully updated capital with the same ID |
| DELETE | `/capital/:id` | 204, no response body |

POST and PUT both require exactly `name`, `latitude`, `longitude` and `country`.
Names and countries must be nonblank strings without NUL characters; surrounding
whitespace is trimmed before storage. Coordinates must be JSON numbers (numeric
strings are rejected), with latitude in [-90, 90] and longitude in [-180, 180].
Unknown fields, including a body `id`, are rejected. PUT replaces all four editable
fields; it does not accept partial updates. IDs must be decimal integers from 1
through 2147483647 without leading zeros. Name uniqueness is case-insensitive;
country uniqueness uses the exact stored text.

Errors from these routes have the shape `{"error":"message"}`:

| Status | Meaning | Example message |
| --- | --- | --- |
| 400 | Invalid body, coordinates, name or ID; malformed JSON | `Invalid request data` |
| 404 | Capital name or ID does not exist | `Capital not found` |
| 409 | Capital name or country conflicts with an existing record | `Capital name or country already exists` |
| 415 | Unsupported request content type | `Content-Type must be application/json` |
| 500 | Unexpected database/server failure | `Internal server error` |

SQL errors, stack traces and credentials are never returned by the capital routes.
`/health` keeps its existing database-backed behavior.

For manual checks, first follow Run the starter (`npm run db`, then `npm run dev`),
or run only the API with `npm run dev -w backend`. Startup still needs the schema,
PostgreSQL and a valid REST Countries key. After the startup import completes:

```bash
curl -s http://localhost:3001/capital
# Example response: [{"id":1,"name":"Berlin","latitude":52.52,"longitude":13.405,"country":"Germany"}, ...]
curl -s http://localhost:3001/capital/bErLiN
# Example response: {"id":1,"name":"Berlin","latitude":52.52,"longitude":13.405,"country":"Germany"}

curl -i -X POST http://localhost:3001/capital \
  -H 'Content-Type: application/json' \
  -d '{"name":"Example City","latitude":10,"longitude":20,"country":"Example Country"}'
# 201: {"id":<generated-id>,"name":"Example City","latitude":10,"longitude":20,"country":"Example Country"}

# Replace <id> below with the integer returned by POST.
curl -i -X PUT 'http://localhost:3001/capital/<id>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Updated City","latitude":11,"longitude":21,"country":"Updated Country"}'
# 200: {"id":<id>,"name":"Updated City","latitude":11,"longitude":21,"country":"Updated Country"}
curl -i -X DELETE 'http://localhost:3001/capital/<id>'
# 204, empty body
curl -i http://localhost:3001/capital/NoSuchCapital
# 404: {"error":"Capital not found"}
```

These write examples change data in the database used by the running API.
For automated checks, `npm test` runs Fastify `inject()` success/error tests with
a mocked DB, without starting the importer or listener. Use the disposable
PostgreSQL example above to verify actual CRUD SQL, uniqueness conflicts on POST
and PUT, persistence after updates/deletes, and existing importer/health behavior.

## Frontend

The React app loads `GET /capital` on mount using native `fetch`. The typed client
expects the backend's plain array of capital objects, validates the response and
reports HTTP, network and malformed-response errors. `frontend/src/capital-store.ts`
uses Zustand as the shared source for capitals, loading and error state. Its
`fetchCapitals` action also supports reload/retry and shares an in-flight request
between callers, including React effect remounts, so responses cannot race.

Run `npm run dev` from the repository root to start both workspaces, or start
`npm run dev -w backend` and `npm run dev -w frontend` in separate terminals.
Use the setup steps above first: the backend needs PostgreSQL, the schema and a
valid REST Countries key, and completes its import before listening. Visit
`http://localhost:5173`; Mapbox needs `VITE_MAPBOX_TOKEN` in the root `.env`.

The browser requests the same-origin relative URL `/capital`. Vite's **development**
proxy forwards `/capital` requests to `http://127.0.0.1:3001`, using `PORT` from
the process environment or root `.env` when set (restart Vite after changing it).
No client-side API URL or additional environment variable is required. The REST
Countries key and database URL stay server-side. A production host must route
`/capital` to Fastify on the same origin; the static build and `vite preview`
do not provide the development proxy.

The English sidebar shows each capital name above its country, preserving API order.
Use the chevron button at the map’s upper-left corner to collapse or expand the
sidebar. Collapsing keeps the search and list state and frees space for the map;
hidden sidebar controls are excluded from keyboard navigation. The map remains
mounted and retains its view and marker colors.

Search countries or capitals using the labeled search field. Matching ignores case
and surrounding whitespace and filters only the list; all map markers remain.
The count beside the heading is the full dataset total, while search reports the
matching count out of that total, including a clear no-matches message.
The **Skip to map** link becomes visible on keyboard focus.

During a request it announces “Loading capitals…”. An empty array shows “No capitals
available yet.” Errors show a readable message and a keyboard-accessible “Try
again” button, which fetches again and clears the previous error. Existing data
is retained in the store during reload/failure but hidden by the status message;
a successful response replaces it, including when the new array is empty.

### Create, edit and delete capitals

Choose **Add capital** above the list to open the form. Enter a capital name,
country name, latitude and longitude, then choose **Create capital**. Choose
**Actions for [capital]** (the three-dot button) beside an entry, then **Edit**
to change the same four fields and **Save changes**. Choose **Delete** from that
actions panel and review the capital/country in the confirmation,
then choose **Delete capital**. **Cancel** or Escape closes either dialog without
writing. While a request is pending, controls and dismissal are disabled to avoid
duplicate submissions. Success is announced above the list.

All fields are required. Blank names/countries and invalid characters are rejected;
latitude must be a finite number in [-90, 90] and longitude in [-180, 180]. Field
errors are linked to their inputs and the first invalid input receives focus.
Coordinates are sent as JSON numbers. Edit sends the complete record using its
original database ID. Duplicate capital names (case-insensitive) or countries
(exact match), missing records, invalid requests and server/network failures show
safe messages inside the dialog and retain entered values. Requests time out after
15 seconds. A lost/malformed response can leave a write's outcome uncertain:
cancel and use **Refresh list** before retrying. No server internals are displayed.

The typed client reuses the existing POST/PUT/DELETE endpoints (including DELETE's
empty 204 response). After each confirmed write, Zustand applies the returned
record or removes its ID in the shared array, keeping names ordered
case-insensitively. No optimistic writes, follow-up GET or full page reload is
needed. Reads and mutations cannot overlap in the UI/store. The list and existing
Mapbox marker lifecycle consume the same state: names/popups and coordinates
update, deleted markers/popups disappear, and the map instance and other marker
colors remain intact. Reload/refresh retrieves PostgreSQL data; other browser
sessions are synchronized only when refreshed. Dialogs support keyboard operation,
restore focus to the initiating control, and fall back to Add capital after deletion
or when an edited entry no longer matches the search. Actions panels open with
Enter or Space; Tab moves through Edit and Delete, Escape closes and restores
focus to the three-dot button, and leaving the row or clicking outside closes them.

**Persistence limitation:** CRUD writes are stored in PostgreSQL, but REST Countries
is reimported on **every backend startup**. Deleted imported capitals can reappear
after a restart; editing both unique names can also allow the original to return.
This feature does not change the import policy or add a reset/reseed action.

Focused Node tests cover mutation HTTP contracts/errors, required/bounded fields,
pending requests and shared-state updates. Interactive cancellation, focus,
list/marker synchronization and desktop/mobile layouts are checked separately
in a real isolated Chromium session against disposable PostgreSQL.

On desktop the list scrolls beside a map that fills the remaining space. At
700px and below they stack, with a bounded, keyboard-scrollable list above a
full-width map. The collapse/expand button stays at the map’s upper-left corner.
Mapbox initializes independently of capital data; a resize
observer keeps its canvas sized to its panel and is disconnected along with the
map on unmount. A missing Mapbox token shows setup guidance while the list still
works.

Each valid capital in the shared store has a square **32 × 32 CSS pixel** marker
at its longitude/latitude. Click a marker, or focus it with Tab and press Enter
or Space, to open its capital/country popup. Choose Teal, Red, Purple or Gold in
the labeled “Marker color” select to update only that marker immediately. The
selected color also has a text name. Escape or the close button closes the popup
and returns keyboard focus to its marker; clicking the map also closes it.

Colors are in-memory frontend state keyed by capital ID. They survive popup
reopening, React rerenders and capital reloads while the map is mounted. Removed
capitals release their markers and colors; new capitals start Teal. A page reload
or map unmount resets colors. Nothing is saved to PostgreSQL or localStorage.
The map stays mounted during data changes, preserving the current view. Markers,
popups, event listeners and the resize observer are cleaned up on unmount.

Markers can overlap at world zoom levels; zoom in to distinguish nearby capitals,
or use keyboard focus to access overlapping markers. No clustering or positional
offsets are applied. Mapbox's globe projection can hide capitals on the far side;
drag the map to reach them. Map tiles require a working Mapbox token and network.
Sidebar rows remain informational; list-to-map navigation, flags, marker/popup
redesign and Reset to default are reserved for later phases.

### Frontend verification

`npm test -w frontend` covers the API contract and failures, request sharing,
loading/error transitions, retry/reload and the rendered list states. Marker tests
use small DOM/Mapbox doubles to cover coordinates, square CSS dimensions, popup
context, independent colors, reopening, data updates, removal and cleanup. These
unit tests do not establish database, native keyboard or browser integration.

For a real browser check after backend startup:

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
   popups. A full page reload should reset colors.
5. Inspect browser console errors. An intentionally mocked HTTP failure is
   expected during the error check; normal loading should have no errors.

`frontend/test/sidebar.browser.mjs` exports `verifySidebar(page, baseURL)` for an
isolated Playwright Page. With the frontend running and Playwright supplied by the
browser tooling, run `await verifySidebar(page, "http://127.0.0.1:5173")` (use the
actual Vite port). It intercepts **all** capital reads/writes with controlled
fixtures and exercises 1440px, 390px and 320px layouts, sidebar/search state,
keyboard menus/dialogs, pending/conflict CRUD, loading/error/retry/empty states,
canvas identity, marker dimensions and overflow. It requires a working Mapbox
public token/network to verify the real canvas. This browser suite is separate
from `npm test`; no Playwright project dependency is installed.

The isolated browser MCP tools configured in `.codex/config.toml` can run these
checks locally with the root `.env`. Browser checks remain separate from CI and
do not introduce private API keys or Mapbox credentials into GitHub Actions.

## Priorities

Must have:

- `db/schema.sql`, running automatically on first start
- Import of the REST Countries data on startup
- All five `/capital` endpoints
- A list of countries with their capitals next to the map
- A 32px × 32px square marker per capital, with a popup to change its color

Nice to have:

- Add, edit and delete a city from the UI
- Remove a city from the map and from the list

## Submission

Push to a private repo and invite the reviewer (or send a zip without `node_modules`).
