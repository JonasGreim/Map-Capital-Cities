# Development and Docker

[Project overview and development setup](../README.md#development) · [Testing](testing.md)

## npm development

Follow the [development setup](../README.md#development) for the pinned runtime,
credentials, installation and normal startup commands. The notes below cover
configuration, troubleshooting and Docker operation.

The existing npm workspaces remain `backend` and `frontend`. Both load variables
from the root `.env`; never commit it. `GET /health` runs `select 1` through the
PostgreSQL pool before returning HTTP 200 and `{"ok":true}`. An unavailable DB
produces HTTP 500. The API defaults to port 3001 (`PORT` can override it).

No Docker or Node? Use a GitHub Codespace (Postgres included) and add both keys as Codespaces secrets.
The devcontainer setup installs the pinned Node/npm versions and runs `npm ci`.
Use `nvm use` in an already-open terminal after setup.

### Local development troubleshooting

Run `nvm use`, then check `node -v` (**24.22.1**) and `npm -v` (**11.19.1**)
in the terminal that starts development. Start PostgreSQL with `npm run db`;
`docker compose -f docker-compose.yml logs db` should report `database system is ready to accept
connections`. Check that the root `.env` uses the matching database, credentials
and host/port (the regular Compose service exposes `localhost:5432`).

`npm run dev` starts both workspaces concurrently. Vite can be ready before the
API: the backend waits for PostgreSQL, initializes an unmarked database or loads
persisted metadata, then prints `API on http://localhost:3001` (or your `PORT`).
Temporary Vite
`ECONNREFUSED` messages before that line are expected. Retry in the UI or reload
once the API is ready; verify `curl -i http://localhost:3001/health` and
`curl -i http://localhost:3001/capital`. Persistent refusals after a watcher failure
mean the backend is still offline; inspect its startup error first.

The backend watcher explicitly excludes `../node_modules/**`: npm runs it from
`backend/`, but hoisted dependencies live above that directory. With tsx 4.23.15,
the default ignore and `**/node_modules/**` alone miss some loaded parent-relative
paths. Normal imported TypeScript edits still restart the backend. See the
[Issue #47 investigation](dev-startup-investigation.md) for reproductions.

**Stop development before installing/updating dependencies in that installation.**
`npm ci` replaces `node_modules`, including the running tsx executable's support
files; an exclusion cannot make that safe. For parallel Codex tasks, give each
worktree its own `npm ci` installation and separate server ports. Do not share or
symlink `node_modules`, or install concurrently in the same directory. If runtime
files such as `tsx/dist/preflight.cjs` are missing, first stop the affected dev
server, select the pinned runtime and repair the installation with `npm ci`.
Do not delete the lockfile or reset PostgreSQL data as a troubleshooting step.

After a failed startup, fix the reported cause and restart development (or press
Return in a standalone `npm run dev -w backend` watcher). Exhausting database
retries does not cause an automatic retry loop. React Fast Refresh boundary
warnings are separate from backend availability.

## Full-stack Docker demo

For a local reviewer demo, use Docker Engine/Desktop with Docker Compose v2.
No host Node/npm installation is needed for this option. From the repository
root, copy `.env.example` to `.env` **if you do not already have one**, then set:

- `RESTCOUNTRIES_API_KEY`: private REST Countries v5 key, passed only to the API
  at **runtime**, required only for the first successful initialization/backfill.
  A completed database starts without this key. Never put it in a `VITE_` variable
  or a Docker build argument.
- `VITE_MAPBOX_TOKEN`: **public** Mapbox browser token (`pk...`), passed to Vite
  at **build time**. It is intentionally visible in the static bundle. Changing
  it requires rebuilding the frontend. An empty Mapbox token fails Compose validation with
  setup guidance; the existing frontend map-error feedback is unchanged.
- `DEMO_PORT`: optional browser port, default **8080**. For example, use
  `DEMO_PORT=8081` in `.env` if 8080 is occupied.

The default `compose.yaml` starts the full stack. It takes precedence over the
DB-only `docker-compose.yml`; the old `compose.full.yaml` name is retired. A warning
that both supported filenames exist is expected: Compose selects `compose.yaml`
without merging them. Use
`npm run db` for development: its explicit `-f docker-compose.yml` selects only
the original database and preserves the development project/volume. Commands
such as development DB logs, exec and shutdown also need that explicit file.

Start the complete stack with one command:

```bash
docker compose up -d
```

Open **http://localhost:8080** (or your `DEMO_PORT`). Only that loopback browser
port is published. Nginx serves the built React app on container port **8080**
and forwards `/capital`, `/capital/:name-or-id`, `/capital-reset` and `/health`
to `api:3001`, preserving paths, methods, bodies and status codes. The API and
PostgreSQL (**5432**) are internal; no browser API URL or extra CORS setup is
needed. Both app containers run as non-root users. The images use the pinned
Node/npm versions and locked workspace dependencies; Nginx runs no Vite server.

Compose sets its own `DATABASE_URL` to `db:5432` and API `PORT` to **3001**;
the root `.env` values for these two settings still apply to npm development.
The DB-only configuration and development ports **5173/3001/5432** are unchanged;
`npm run db` explicitly selects that file, and `npm run dev` is unchanged. Both workflows can run
alongside each other because the demo publishes only its browser port.

The separate Compose project **`map-capitals-demo`** owns the named volume
**`map-capitals-demo_demo-pgdata`**. It never mounts the normal development
`pgdata` volume. PostgreSQL runs `db/schema.sql` when that demo volume is empty.
The backend also applies this idempotent schema transactionally when no import marker exists,
covering existing volumes and managed PostgreSQL. Completed starts only read the
marker and persisted metadata; they preserve all capital edits and deletions.
If you use `-p another-name`, include it in **every** command below: that project
has its own volume and containers. Keep the same project name to retain data.

PostgreSQL must pass `pg_isready` before the API starts. The API waits for the DB,
completes first initialization or loads persisted metadata, then opens HTTP. Its
health check calls the existing DB-backed `/health`. Nginx starts only after the
API is healthy. Allow
a short first-start/import phase; health checks allow about seven minutes for
startup before marking the API unhealthy. `up -d` does not guarantee the
frontend has completed its own first health check; inspect status and HTTP:

```bash
docker compose ps -a
docker compose logs --tail=100 api db frontend
curl -i http://localhost:8080/health
curl -i http://localhost:8080/capital
```

On a fresh checkout, `up -d` builds missing local images automatically. After
source or public-token changes, use the rebuild command below.
Fix any reported key/network/startup error, then run the start command again.
There is no automatic restart loop. A failed import aborts startup before HTTP
opens, so the frontend is not started on a fresh failed launch. During a later
API outage, the proxy may return 502; the frontend health check also fails.
After API recovery, retry/reload the UI. Docker DNS is re-resolved by the proxy
so API container recreation does not require restarting Nginx.

```bash
# Stop and remove this stack's containers/network; keep its database volume.
docker compose down
# Start again using the existing images and persisted database.
docker compose up -d
# Rebuild after code changes or a public Mapbox token change.
docker compose up --build -d --force-recreate
# Restart only the API (loads persisted metadata; no repeat import).
docker compose restart api
```

This is a local demo without authentication/TLS or production hosting. External
network access and a valid REST Countries key are required for first initialization;
Mapbox and flag CDN access are needed for map/flag images. Subsequent API starts
use PostgreSQL without upstream requests; edits, deletions and custom rows survive.
Never delete volumes as routine cleanup. Avoid printing expanded
`docker compose config` output: it contains the runtime API key; use
`docker compose config --quiet` for validation.
See the [Docker validation report](full-stack-docker-validation.md) for
the real build, HTTP/CRUD, persistence, browser and failure checks and their limits.

## Database initialization

All Compose configurations mount [db/schema.sql](../db/schema.sql) read-only into PostgreSQL's
`/docker-entrypoint-initdb.d/`. It runs automatically **only when the database
storage is first initialized**. Existing `pgdata` volumes and rows are preserved;
Docker does not rerun init scripts on them. The backend applies the schema before
the first import/backfill automatically. To inspect/apply just the schema manually
without resetting an existing volume, use:

```bash
docker compose -f docker-compose.yml exec -T db psql -U postgres -d capitals -v ON_ERROR_STOP=1 < db/schema.sql
# In a devcontainer, use: docker compose -f .devcontainer/docker-compose.yml exec ...
```

The script can be reapplied to this schema. It is not a migration framework and
does not repair an incompatible, manually created `capitals` table.

## Database initialization and recovery (#69)

REST Countries is called only before the first successful initialization of a
database. `country_metadata` and `import_state` persist alongside capitals.
An existing populated development volume gets a one-time metadata backfill;
all capital values, IDs and deletions remain unchanged. Do not wipe volumes or
manually remove the completion marker. No explicit migration command is needed:
the backend includes `db/schema.sql`, applies it safely and does not listen until
the initialization transaction commits. The schema owner/runtime role must have
the necessary CREATE/read/write permissions during that first initialization.

Missing API keys, upstream failures or SQL errors on an uninitialized DB cause a
nonzero startup failure and rollback. Fix the key/network/permissions and restart.
After completion the key can be omitted and upstream outages do not affect
startup. A recreated/expired database, including a future Render DB replacement,
is a new empty database and needs the key again. This is not scheduled refresh;
reset only replaces capitals from the bundled snapshot and keeps metadata/status.
See [transaction and concurrency details](technical-reference.md#backend).
