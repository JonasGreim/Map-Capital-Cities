<p align="right"><a href="https://github.com/JonasGreim/Map-Capital-Cities/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://github.com/JonasGreim/Map-Capital-Cities/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status on main"></a></p>

# Map Capital Cities

<p align="center">
  <img src="frontend/public/favicon.svg" alt="Map Capital Cities globe logo" width="100" height="100">
</p>

## 🔍 Project Overview

### Short Description

Explore and manage capital cities on an interactive world map, with PostgreSQL-backed
CRUD and country information imported from REST Countries v5.

- Interactive Mapbox world map with square 32 × 32px markers and a linked capital/country list.
- Create, edit and delete capitals; pick coordinates on the map or restore the default dataset.
- Search the list by capital or country; filter both the list and map by continent.
- Country flags and popup facts: continent, country population and currencies.
- Four marker colors, saved in the current browser across reloads.
- Desktop sidebar and mobile **Map / Capitals** bottom navigation.

### Tech Stack

- **Frontend:** React 18, TypeScript, Vite 5, Zustand 4, plain CSS.
- **Backend:** Node.js 24, Fastify 5 · **Database:** PostgreSQL 16.
- **Maps & Data:** Mapbox GL JS 3, REST Countries v5.
- **Infrastructure:** npm workspaces, Docker Compose, Nginx.
- **Testing & Quality:** Node test runner / tsx, ESLint, TypeScript, GitHub Actions.

## 📚 Table of Contents

1. [Screenshots](#screenshots)
2. [Getting Started](#getting-started)
3. [Development](#development)
4. [Architecture](#architecture)
5. [Testing](#testing)
6. [Documentation](#documentation)

## 🖼️ Screenshots <a name="screenshots"></a>

<!-- TODO: Add docs/images/desktop.png, then remove this comment wrapper.
<img src="docs/images/desktop.png" alt="Desktop: capital list beside the world map, capital markers and an open country popup" width="960">
-->

<!-- TODO: Add both mobile images, then remove this comment wrapper.
<p>
  <img src="docs/images/mobile-map.png" alt="Mobile Map view with capital markers and Map / Capitals bottom navigation" width="280">
  <img src="docs/images/mobile-capitals.png" alt="Mobile Capitals view with country search and continent filter" width="280">
</p>
-->

## 🚀 Getting Started <a name="getting-started"></a>

### Prerequisites

- Docker Engine / Docker Desktop with Docker Compose v2; no host Node/npm required.
- A [REST Countries API key](https://restcountries.com) and a [public Mapbox token](https://account.mapbox.com).

### Environment Variables

Create `.env` once from the repository root, then fill in the two keys below; never commit it.

```bash
cp .env.example .env
```

```dotenv
RESTCOUNTRIES_API_KEY=your_private_api_key
VITE_MAPBOX_TOKEN=your_public_mapbox_token
```

### Running the Application

```bash
docker compose -f compose.full.yaml up --build -d
```

**Application:** <http://localhost:8080>. Stop the stack while keeping its separate demo database volume:

```bash
docker compose -f compose.full.yaml down
```

See [Docker details](docs/development.md#optional-full-stack-docker-demo) for configuration and operation.

## 🛠️ Development <a name="development"></a>

### Prerequisites

- Node.js **24.22.1**, npm **11.19.1** and Docker with Compose for PostgreSQL.

### Running the Development Server

Use the `.env` configured under [Getting Started](#getting-started) for hot reload:

```bash
npm ci
npm run db
npm run dev
```

- **Frontend:** <http://localhost:5173>
- **Backend:** <http://localhost:3001>
- **Health:** <http://localhost:3001/health>

See [development setup and troubleshooting](docs/development.md).

## 🏗️ Architecture <a name="architecture"></a>

```text
React + Vite + Zustand ──► Fastify REST API ──► PostgreSQL
        │                        ▲
        ▼                        │ startup import
     Mapbox                REST Countries v5
```

CRUD and reset have no authentication; use disposable demo data. Backend restarts
can restore deleted imported capitals; see [reset and persistence limits](docs/technical-reference.md#reset-to-default).

## 🧪 Testing <a name="testing"></a>

```bash
npm run check
npm test
```

`check` runs ESLint, TypeScript and builds; `test` runs backend and frontend tests.
GitHub Actions runs these checks on PRs and pushes to `main`.
See [Testing](docs/testing.md) for separate PostgreSQL and Chromium tests; Chromium is not part of CI.

## 📖 Documentation <a name="documentation"></a>

- [Technical Reference](docs/technical-reference.md): API, import, schema, reset/security and UI behavior.
- [Development](docs/development.md): configuration, Docker operation and troubleshooting.
- [Testing](docs/testing.md): unit, PostgreSQL, browser tests and coverage status.
- [Submission / Validation](docs/submission.md): readiness checklist and validation reports.
