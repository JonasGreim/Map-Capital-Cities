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
npm test               # mocked importer/readiness tests and Fastify health/CORS tests
git diff --check
```

CI runs `npm ci`, `npm run check` and `npm test` on PRs and main pushes,
using the pinned runtime without secrets or a database. Import tests mock REST
Countries; the health tests inject a fake DB. The optional PostgreSQL suite skips
unless `TEST_DATABASE_URL` is explicitly set (see below). Verify the real running
API separately with `curl -i http://localhost:3001/health` after startup completes.
App construction (`buildApp` in
`backend/src/app.ts`) does not start a listener.

`npm audit` still reports Vite 5 (high) and its esbuild dependency (moderate).
These development-tool advisories require a separately reviewed Vite upgrade;
do not use `npm audit fix --force`. The Express/body-parser and shell-quote
findings were removed by the Fastify migration and a compatible concurrently 9 update.

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

For real PostgreSQL checks, point the opt-in suite at a **disposable test database**:

```bash
TEST_DATABASE_URL=postgres://postgres:postgres@localhost:55432/capitals npm test
```

The suite creates a uniquely named schema, tests constraints, multi-page import,
repeat imports, local edits, deletion/reimport, rollback and DB-backed health,
then removes only that test schema. It never uses `DATABASE_URL` as a fallback.
REST Countries is still mocked; no real API key is needed. Real startup with a
valid key should log import counts before the API begins listening.

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

**Initial import policy:** every backend start imports again, without updating
existing records or writing a persistent completion marker. Records conflicting
with either unique constraint retain their local values. **Deleting an imported
capital may cause it to reappear after a backend restart.** Changing both its name
and country can likewise allow the original to be inserted again, because neither
unique key then matches. A future seed-once policy can wrap the importer without
changing its fetching/transformation logic; no reset button is included here.

Endpoints:

```
GET    /capital          all capital cities
GET    /capital/<name>   one by name (case-insensitive)
POST   /capital          create
PUT    /capital/<id>     update
DELETE /capital/<id>     delete
```

## Frontend

Connect the UI to the endpoints above. Implementation and UI/UX choices are yours.

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
