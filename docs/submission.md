# Reviewer submission readiness — Issue #34

Prepared on **26 October 2026** from GitHub `main`
`5efea5252861aee0f4ffd11fbb58588909daec91` (includes Docker #35 and mobile #38/#39).
This is a documentation change; application code, API, schema, dependency manifests,
lockfile and CI configuration are unchanged. Existing validation reports remain
historical evidence for their recorded commits; they are not fresh whole-app tests.

## Documentation migration

The initial extraction reduced the README from **911 to 148 lines**; the header
and navigation follow-up now presents the same core information in **127 lines**.
Entry points are Project Overview, Tech Stack, Table of Contents, Screenshots,
Getting Started (Docker), Development (npm), Architecture, Testing and Documentation.

| Previous README content | Current location |
| --- | --- |
| Standard development, root environment, Codespaces, watcher/startup troubleshooting | [Development](development.md#npm-development), plus concise [development setup](../README.md#development) |
| Full-stack Docker setup, ports, volume separation, lifecycle, failures, security | [Docker operation](development.md#optional-full-stack-docker-demo) |
| First-run SQL and existing-volume setup | [Database initialization](development.md#database-initialization) and [data model](technical-reference.md#data) |
| REST Countries mapping, pagination, validation, transactions and restart/import limitations | [Backend/import](technical-reference.md#backend) |
| Metadata, full route/response contracts, validation/errors and curl examples | [Capital API](technical-reference.md#capital-api) |
| Zustand, proxy/hosting, search/filter, CRUD/picker, mobile navigation, map lifecycle, errors, flags and colors | [Frontend](technical-reference.md#frontend) |
| Default snapshot provenance/hash, reset transaction, confirmation/recovery and public-demo security | [Reset](technical-reference.md#reset-to-default) |
| Quality commands, mocks versus real DB, audits, PostgreSQL setup, browser suites/runner and CI prerequisites | [Testing](testing.md) |
| Assignment priorities and submission instructions | [Architecture](technical-reference.md#architecture) and checklist below |

Extraction retained the detailed contracts, examples, limitations and browser
instructions. Removed text was starter wording or repeated setup. Corrected stale
claims that no reset button existed and that mobile still stacked list/map;
metadata wording now includes all country facts. Added the already implemented
responsive browser suite to the runner description. No QA report was deleted.
The [startup investigation](dev-startup-investigation.md), [core validation](final-validation.md),
[mobile navigation](mobile-navigation-validation.md), [responsive QA](mobile-responsive-qa.md),
[Docker validation](full-stack-docker-validation.md) and
[animation audit](animation-opportunities-audit.md) remain available unchanged.

## Badge and screenshot decisions

The sole badge is GitHub's native **CI** badge for `main`, sourced from the real
[workflow](../.github/workflows/ci.yml). It indicates workflow success, not test
coverage. Private-repository links require appropriate GitHub access.

No coverage reports/publisher existed. A dependency-free Node V8 backend diagnostic
was executed successfully; it covers only loaded backend modules, with optional
PostgreSQL tests skipped, and needs source-map validation before interpreting its
totals as a stable metric. It excludes frontend, browser and unloaded entry-point
code. [Coverage status](testing.md#coverage-status) includes the reproducible command
and explains why no project-wide percentage or automatic badge is advertised.
No public uploads, service, token, dependency or GitHub permission was added.

The README contains commented references to `docs/images/desktop.png`,
`docs/images/mobile-map.png` and `docs/images/mobile-capitals.png`. The desktop
image is capped at 960px; mobile images use 280px widths beside each other. Each
has descriptive alt text. Add the three files, then remove the two comment
wrappers. No screenshots or artificial image files were created for this change.

## Validation in this change

- Node **24.22.1**, npm **11.19.1**; separate worktree and physical `npm ci` install.
- `npm run check`: passed (ESLint, both typechecks and production builds).
- `npm test`: **135 passed, 2 skipped, 0 failed**. Optional PostgreSQL integration
  suites skipped because no isolated `TEST_DATABASE_URL` was supplied to this run.
- Existing Vite bundle-size warning and development advisories (Vite high,
  esbuild moderate) remain; no dependency upgrade or audit fix was made.
- `npm run db` passed using the unchanged script with an isolated Compose project
  and test-only host-port override (55434). `npm run dev` completed a real REST
  Countries import into that fresh PostgreSQL database: 248 capitals; health,
  list, frontend HTML and the Vite proxy passed. Existing ports 5173/3001 were
  occupied, so smoke ports were 5174/3034. The documented defaults were checked
  against package scripts, Vite configuration and `.env.example`.
- Full-stack `up --build -d`, `config --quiet` and `down` passed with project
  `map-capitals-issue34-demo`, `DEMO_PORT=8084` and a separate fresh volume. All
  three services were healthy; HTML, `/health` and `/capital` passed through
  Nginx with 248 live-imported capitals. No CRUD/reset request or screenshot was
  needed for this documentation smoke. Own containers were stopped; both smoke
  volumes were retained, and normal development services/data were untouched.
- CommonMark + table rendering and all **63 local links/anchors** across README
  and all ten `docs/` files passed. Commented screenshot references do not render
  missing images. Heading hierarchy, table, fenced commands and alt text checked.
- All 20 public external documentation/source URLs returned HTTP 200. Private
  repository URLs and the badge returned 404 without authentication; repository,
  base commit, issues and actual workflow were checked with the connected GitHub
  API. Badge rendering for an authenticated reviewer remains a manual check.
  Local URLs are service endpoints, not public documentation links: the API root
  intentionally has no route; Docker was exercised on the isolated port above.
- Current tracked files plus documentation additions were scanned for the actual
  locally configured API credentials and common credential patterns: no matches.
  No `.env`, assignment PDF, screenshot, browser state or generated artifact is
  tracked/staged. This scoped check is not an exhaustive history/security audit.
- `git diff --check` passed; the final diff and intended file list were reviewed.
  The original checkout was clean before work and remains unchanged. CLI Git
  authentication was unavailable; the connected GitHub API verified the exact
  base SHA and is used for publishing the feature branch/PR.

## Manual handoff

- [ ] Review the open PR and confirm CI for its actual head; merge remains manual.
- [ ] Add the three final screenshots and remove their comment wrappers.
- [ ] Confirm reviewer access to the **private** repository, or prepare an archive
  without `node_modules`, `.env`, credentials, build/browser artifacts or the
  private assignment PDF. No invitation, permission or visibility change was made.
- [ ] Give the reviewer the Quick Start and ask them to configure their own REST
  Countries key and public Mapbox token. Do not distribute the local `.env`.
- [ ] If required for handoff, repeat CRUD/mobile interactions on target devices;
  historical browser evidence and real-device limits are linked above.
- [ ] Send the reviewed submission manually. No automatic submission was performed.
