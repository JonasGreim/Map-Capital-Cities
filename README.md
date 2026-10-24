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
npm test               # Fastify inject tests: health success, DB failure and CORS
git diff --check
```

CI runs `npm ci`, `npm run check` and the health tests on PRs and main pushes,
using the pinned runtime without secrets or a database. The health tests inject a
fake DB; verify the real connection separately with `curl -i http://localhost:3001/health`
after starting PostgreSQL and the API. App construction (`buildApp` in
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
{ "id": "...", "name": "string", "latitude": 0.0, "longitude": 0.0, "country": "string" }
```

`name` and `country` are unique. Provide `db/schema.sql`; it must run automatically the first time the database starts.

## Backend

On startup, import countries and capitals from [REST Countries](https://restcountries.com/docs) v5
(`country` = common name, `name` = capital):

```
GET https://api.restcountries.com/countries/v5
Authorization: Bearer <RESTCOUNTRIES_API_KEY>
```

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
