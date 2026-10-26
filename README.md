# Map Capital Cities

Explore and manage capital cities on an interactive world map. Built as a
full-stack take-home project, with PostgreSQL-backed CRUD and country data from
REST Countries v5.

[![CI](https://github.com/JonasGreim/Map-Capital-Cities/actions/workflows/ci.yml/badge.svg?branch=main)](https://github.com/JonasGreim/Map-Capital-Cities/actions/workflows/ci.yml?query=branch%3Amain)

## Features

- Interactive Mapbox world map with square 32 × 32px capital markers and a linked country/capital list.
- Create, edit and delete capitals from the list or map popup; enter coordinates or pick them on the map.
- Search the list by capital or country; filter both the list and map by continent.
- Country flags and popup facts: continent, country population and currencies.
- Four marker colors, saved in the current browser across reloads.
- Responsive desktop sidebar and mobile **Map / Capitals** bottom navigation.
- Restore the reviewed default dataset with a confirmation dialog.

CRUD and reset have no authentication: use disposable demo data. Backend restarts
reimport live data, so deleted imported capitals can return. See the
[technical reference](docs/technical-reference.md#reset-to-default) for reset and persistence limits.

## Screenshots

Final screenshots will be added here: desktop map/sidebar with an open popup,
mobile Map with bottom navigation, and mobile Capitals with search and filters.

<!-- TODO: Add docs/images/desktop.png, then remove this comment wrapper.
<img src="docs/images/desktop.png" alt="Desktop: capital list beside the world map, capital markers and an open country popup" width="960">
-->

<!-- TODO: Add both mobile images, then remove this comment wrapper.
<p>
  <img src="docs/images/mobile-map.png" alt="Mobile Map view with capital markers and Map / Capitals bottom navigation" width="280">
  <img src="docs/images/mobile-capitals.png" alt="Mobile Capitals view with country search and continent filter" width="280">
</p>
-->

## Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | React 18, TypeScript, Vite 5, plain CSS |
| State / map | Zustand 4, Mapbox GL JS 3 |
| Backend | Node.js 24, Fastify 5, PostgreSQL client `pg` |
| Database / external data | PostgreSQL 16, REST Countries v5 |
| Infrastructure | npm workspaces, Docker Compose, Nginx (Docker demo) |
| Quality | ESLint, TypeScript, Node test runner / tsx, GitHub Actions |

## Quick Start

### Prerequisites

- **Node.js 24.22.1** and **npm 11.19.1**; commands below use [nvm](https://github.com/nvm-sh/nvm).
- Docker with Docker Compose for PostgreSQL.
- A [REST Countries API key](https://restcountries.com) and a [public Mapbox token](https://account.mapbox.com).

### Environment

From the repository root, create your local configuration once:

```bash
cp .env.example .env
```

Fill in these two values in `.env`:

```dotenv
RESTCOUNTRIES_API_KEY=your_private_api_key
VITE_MAPBOX_TOKEN=your_public_mapbox_token
```

Keep the private key server-side; only the public Mapbox token reaches the browser.
[.env.example](.env.example) includes `DATABASE_URL` for PostgreSQL on `localhost:5432`
and the default API `PORT=3001`. Never commit `.env`.

### Start

```bash
nvm install                         # installs/selects the version in .nvmrc
npm install --global npm@11.19.1     # nvm does not pin npm to this version
nvm use
npm ci
npm run db
npm run dev
```

- Frontend: <http://localhost:5173>
- Backend: <http://localhost:3001>
- DB-backed health check: <http://localhost:3001/health>

PostgreSQL runs `db/schema.sql` when its storage is first initialized. The backend
waits for PostgreSQL, imports REST Countries data, then opens the API port; Vite may
be available earlier. Stop development before reinstalling dependencies.
See [development and existing-database setup](docs/development.md) or the
[startup investigation](docs/dev-startup-investigation.md) if startup fails.

## Docker

With the same configured `.env`, start the frontend, API and database together:

```bash
docker compose -f compose.full.yaml up --build -d
```

Open <http://localhost:8080>. The demo uses a separate persistent database volume,
independent of the npm development database. The public Mapbox token is required
at frontend build time; no host Node/npm installation is needed.

Stop the demo while keeping its database volume:

```bash
docker compose -f compose.full.yaml down
```

See [Docker operation](docs/development.md#optional-full-stack-docker-demo) and
[full-stack validation](docs/full-stack-docker-validation.md) for details.

## Testing

```bash
npm run check
npm test
```

`check` runs ESLint, TypeScript and both builds; `test` runs backend and frontend
tests. GitHub Actions runs these checks on pull requests and pushes to `main`.
PostgreSQL integration requires an explicitly configured isolated test database.
Chromium browser suites exist and run separately; they are **not enabled in CI**.
The badge reports CI status, not coverage; no automatic percentage is published.
See [testing, browser setup and coverage status](docs/testing.md).

## Architecture and Documentation

```text
React + Vite + Zustand ──► Fastify REST API ──► PostgreSQL
        │                        ▲
        ▼                        │ startup import
     Mapbox                REST Countries v5
```

The API exposes capital list/name reads, create/update/delete, explicit reset and
DB-backed health. Detailed contracts and behavior live in:

- [Technical reference](docs/technical-reference.md): API, validation, import, schema, reset/security, UI and marker colors.
- [Development](docs/development.md) and [testing](docs/testing.md): setup, Docker, troubleshooting, integration and browser commands.
- [Submission checklist and documentation migration](docs/submission.md): review readiness, preserved content and remaining manual steps.
- Validation reports: [core assignment](docs/final-validation.md), [mobile navigation](docs/mobile-navigation-validation.md), [responsive QA](docs/mobile-responsive-qa.md) and [Docker](docs/full-stack-docker-validation.md).
