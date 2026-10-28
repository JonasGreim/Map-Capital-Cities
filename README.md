<p align="right"><a href="https://github.com/JonasGreim/Map-Capital-Cities/actions/workflows/ci.yml?query=branch%3Amain"><img src="https://github.com/JonasGreim/Map-Capital-Cities/actions/workflows/ci.yml/badge.svg?branch=main" alt="CI status on main"></a></p>

# Map Capital Cities

<p align="center">
  <img src="frontend/public/favicon.svg" alt="Map Capital Cities globe logo" width="100" height="100">
</p>

## 🔍 Project Overview

### Short Description

Explore capital cities around the world on an interactive map. Discover countries and their capitals, search and filter locations, customize markers, and add or edit your own entries.

- **Interactive navigation:** Search and filter capitals, then select one to fly to its location on the map
- **Country information:** Explore flags, population, continents and currencies in interactive popups
- **Capital management:** Create, edit and delete capitals directly in the application
- **Responsive design:** Desktop sidebar and mobile bottom navigation

### Tech Stack

- **Frontend:** React 18, TypeScript, Vite 5, Zustand 4, plain CSS
- **Backend:** Node.js 24, Fastify 5 · **Database:** PostgreSQL 16
- **Maps & Data:** Mapbox GL JS 3, REST Countries v5
- **Infrastructure:** npm workspaces, Docker Compose, Nginx
- **Testing & Quality:** Node test runner / tsx, ESLint, TypeScript, GitHub Actions

## 📚 Table of Contents

1. [Screenshots](#screenshots)
2. [Getting Started](#getting-started)
3. [Development](#development)
4. [Architecture](#architecture)
5. [Testing](#testing)
6. [Documentation](#documentation)

## 🖼️ Screenshots <a name="screenshots"></a>

<img src="docs/images/desktop.png" alt="Desktop: European capital markers, Paris selected in the list and an open country popup" width="960">

<p>
  <img src="docs/images/mobile-map.png" alt="Mobile Map view with Paris country information, capital markers and bottom navigation" width="280">
  <img src="docs/images/mobile-capitals.png" alt="Mobile Capitals view with search, Europe filter, capital list, Add and Reset controls" width="280">
</p>

## 🚀 Getting Started <a name="getting-started"></a>

### Prerequisites

- Docker with Docker Compose v2
- A [REST Countries API key](https://restcountries.com) for the first database initialization
- A [public Mapbox token](https://account.mapbox.com)

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
docker compose up -d
```

**Application:** <http://localhost:8080>

See [Docker details](docs/development.md#full-stack-docker-demo) for configuration and operation.

## 🛠️ Development <a name="development"></a>

### Prerequisites

- Node.js `24.22.1`
- npm `11.19.1`
- Docker with Docker Compose v2

### Running the Development Server

Use the `.env` configured under [Getting Started](#getting-started) for hot reload:

```bash
npm ci
npm run db
npm run dev
```

- **Frontend:** <http://localhost:5173>
- **Backend:** <http://localhost:3001>

See [development setup and troubleshooting](docs/development.md).

## 🏗️ Architecture <a name="architecture"></a>

```text
React + Vite + Zustand ──► Fastify REST API ──► PostgreSQL
        │                        ▲
        ▼                        │ first DB import
     Mapbox                REST Countries v5
```

REST Countries is queried only during the **first successful initialization of a
database**. Capitals, country metadata and the completion marker persist in
PostgreSQL. Later backend starts make no REST Countries requests and need no API
key; manual CRUD changes (including deletions) survive until an explicit reset.
Existing populated databases receive a non-destructive metadata backfill on the
first upgraded start. Failed imports roll back and can be retried. See the
[initialization and recovery details](docs/technical-reference.md#backend).

The [Render deployment guide](docs/render-deployment.md) prepares a separate static
frontend, sleeping Free API and disposable Free PostgreSQL database. A hosted demo
is intentionally anonymous: all visitors share edits, deletions and manual resets.
Free PostgreSQL expires after 30 days, so this requires owner maintenance. No public
demo URL is listed until the owner provisions and verifies the deployment.

## 🧪 Testing <a name="testing"></a>

```bash
npm run check
npm test
```

`check` runs linting, TypeScript and builds; `test` runs backend and frontend tests.
See [Testing](docs/testing.md) for details.

## 📖 Documentation <a name="documentation"></a>

- [Technical Reference](docs/technical-reference.md): API, import, schema, reset/security and UI behavior
- [Development](docs/development.md): configuration, Docker operation and troubleshooting
- [Free Render deployment](docs/render-deployment.md): Blueprint setup, shared public demo, secrets, free-plan limits and database replacement; provisioning and live verification remain owner steps
- [Testing](docs/testing.md): unit, PostgreSQL, browser tests and coverage status
- [Submission / Validation](docs/submission.md): readiness checklist and validation reports
