# Local development startup — Issue #47

Investigated on 26 October 2026 from verified GitHub `main`
`e39b4df2741033ff25c6733fa32b6c0753ea9fe1`, including the issue and its comment.
The assignment PDF was readable. No overlapping open PR was returned.

## Evidence and conclusions

- Historical logs show Node 22.23.3. This session's default shell also selected
  Node 22, despite Node 24 being installed. Every install/test/dev command below
  explicitly selected Node **24.22.1**, npm **11.19.1**, with locked tsx **4.23.15**.
- The watcher defect **also reproduces on Node 24**. Running the real backend
  entry point with the old `tsx watch src/index.ts` command, changing the loaded
  hoisted `node_modules/fastify/fastify.js` produced
  `change in ./../node_modules/fastify/fastify.js Restarting...`.
- A small Fastify fixture explicitly loaded the exact reported nested Ajv
  `dist/vocabularies/jtd/values.js`. Editing it and temporarily moving it produced
  both `change` and `unlink` restarts, and a missing-module failure. Each file was
  restored. This isolates the watcher behavior from PostgreSQL and the importer.

| Watch configuration, cwd `backend/` | Loaded parent Ajv edit/unlink | Imported TS edit |
| --- | --- | --- |
| Default | Restarts | Restarts |
| `--exclude "**/node_modules/**"` | Still restarts | Restarts |
| `--exclude "../node_modules/**"` | No restart | Restarts successfully |

The locked CLI contains the documented default `node_modules` ignore but feeds
imported absolute paths into a watcher with the workspace cwd. Its default glob
does not exclude the observed parent-relative files. The effective correction is
the explicit **parent directory** exclusion, with no tool or dependency upgrade.
Upstream [watch documentation](https://tsx.hirok.io/watch-mode) describes the
default ignore and `--exclude`; [tsx #810](https://github.com/privatenumber/tsx/issues/810)
reports a related parent-path failure in pnpm. Our npm reproduction, rather than
that different package manager, supports this change.

After stopping the isolated dev servers, a separate fixture temporarily moved
only its installed `tsx/dist/preflight.cjs` and triggered a source restart. Node
24 reported `Cannot find module '.../tsx/dist/preflight.cjs'`, even with the
corrected exclusion. The file was restored immediately. This models the missing
runtime-file interval; **no install was run while a dev server was active**.

Replacing dependencies during development can therefore explain the historical
failure chain. The historical modifying process was **not identified**. Neither
the logs nor these controlled simulations prove that Codex or `npm ci` caused
those particular deletions. The wrong Node version alone does not explain a
missing file. A running server cannot be promised to survive replacement of its
runtime dependencies; separate worktrees must have separate physical installs.

## Readiness changes

The previous implementation retried every failure ten times and discarded the
cause. It could delay authentication/configuration feedback while allowing only
about nine seconds for a DB that immediately refused connections.

Known temporary connection/startup errors now have up to **30 attempts**, with
one-second gaps. Authentication failures, missing database, unknown host and
unrecognized failures stop on the first attempt with fixed actionable hints.
Raw error messages/codes, connection URIs and nested causes are not logged by
readiness. Existing pool connection/query timeouts remain **2s/5s**. The total
wait includes those durations; this is an attempt budget, not a 30s deadline.
Unit tests reject invalid budgets and cover retry exhaustion and secret omission.

No importer transaction, schema, Compose service, proxy, UI or dependency changes.
Every backend restart still performs the existing startup import. Failed startup
does not automatically rerun forever: fix the cause and restart the dev command,
or press Return in the standalone backend watcher.

## Validation

All work used `/tmp/map-capitals-issue47`, its own `npm ci` installation and two
PostgreSQL 16 containers with temporary storage on **55447/55448**. The existing
development server and database on 5432 were left alone. Root `.env` loading was
exercised using test-only settings: API **3047**, Vite **5174** (5173 was occupied).
No original credentials or database records were needed.

- `npm ci`: passed with unchanged lockfile. npm reported existing esbuild install
  script-policy notices; the subsequent builds and runtime tests passed.
- `npm run check`: passed, including lint, both typechecks and production builds.
- `npm test`: **147 passed, 0 failed, 0 skipped**: 61 backend (including real
  PostgreSQL schema/import/CRUD/health/reset subtests), 84 frontend, 2 branding.
- Eight focused readiness tests passed, covering immediate success, temporary
  failures, timeout variants, fail-fast configuration, sanitization and bounds.
- Three consecutive real TypeScript source edits restarted the backend. After
  each, `/health`, `/capital` and Vite `/capital` returned **200**. A loaded
  dependency edit with the fixed watcher caused no restart.
- A real PostgreSQL instance started after the readiness wait began: **12
  attempts, 11.0 seconds**, then success. Bad password and missing database each
  failed after **one attempt** (5ms/3ms), with no raw connection details.
- The full npm dev backend also recovered when its own disposable DB was stopped
  before a source restart and recreated after an eleven-second delay. Import
  completed and health/proxy returned **200**. A manually sequenced run that
  exceeded the budget first failed after 30 attempts, as designed; restarting
  after correcting availability succeeded. No unlimited retry was introduced.
- In isolated Chromium, an intentionally held startup import caused Vite
  `ECONNREFUSED` and the existing `Unable to load capitals (HTTP 500)` / `Try again`
  state. Releasing the import and clicking **Try again** displayed the real
  PostgreSQL fixture row through the unchanged proxy, without a page reload.
- `git diff --check`: passed. Audit: existing **1 high (Vite), 1 moderate
  (esbuild)** development advisories; **0 production** findings. No audit fix.

The first integration invocation used the same disposable URL as the smoke
server. The existing reset guard correctly rejected that configuration before
resetting anything. The final suite used the second disposable DB instead;
the guard and tests were unchanged. Initial CLI Git fetch lacked credentials;
GitHub's connected API verified the exact main SHA instead.

REST Countries was intercepted only in external smoke-test tooling, with a
controlled response passed through the **unchanged real importer and PostgreSQL**.
No live REST Countries calls were made on repeated restarts. No Mapbox token was
provided: Chromium verified the existing map-unavailable state and capital
loading/retry, not WebGL/map rendering. These checks establish lifecycle behavior,
not production API availability or an exhaustive test of every OS/network error.
React Fast Refresh warnings and existing Vite bundle-size warnings remain separate.

Local logs and temporary fixtures are outside Git under `/tmp/issue47-*`; they
are diagnostic artifacts, not runtime dependencies. See README troubleshooting
for the normal start order and safe parallel Codex workflow.
