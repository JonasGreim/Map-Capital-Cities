# Backend test audit — Issue #75

Baseline: `00f9124` (#73 and #74 merged), matched to live `main`. Issue #75 had
no comments or overlapping open PRs. Read the assignment PDF, AGENTS, test-audit
skill/checklist, testing guide, previous audits, all ten backend suites, their
production owners/callers, schema, CI and relevant history (#19/#43/#65/#69).
Discovery and the PostgreSQL baseline preceded edits. No product, schema,
frontend, dependency, Docker or CI changes.

## Decisions and preservation ledger

| Original owner / candidate | Decision | Detectable regression / remaining proof |
| --- | --- | --- |
| `capital-routes`: GET-name SQL pattern, POST/PUT/DELETE success, fake uniqueness errors | Remove duplicates | `postgres` CRUD checks generated IDs, trimming, case-insensitive lookup, complete updates, empty 204, persisted rows and both unique conflicts on POST/PUT. Literal apostrophes/SQL-looking text now pass through actual create/lookup SQL rather than matching query strings. |
| `capital-routes`: stateful metadata fake implementing INSERT/UPDATE/lookup | Remove fake DB | `postgres` metadata case verifies list, lookup, manual create and changed-country update against actual stored rows, including zero/unknown facts and no metadata columns in capitals. Seed-once suite verifies persisted metadata across a new pool. Parser units retain ambiguity, normalization and multi-continent cases; no fake persistence engine. |
| `capital-routes`: separate read-only metadata request matrix | Merge | Same inputs join the existing POST/PUT invalid-body table; all metadata fields, missing fields, types, bounds, extra properties and no-query rejection share one owner. |
| `capital-routes`: empty list, 404/max valid ID, coordinate boundaries, invalid IDs/names/JSON/media and safe 500 | Keep | Cheap HTTP/schema/error-handler contracts; the SQL layer cannot establish no-query validation or parser/error scoping. Each write route remains exercised. |
| `import-capitals`: parsing and metadata cases through `importCapitals(fakeDB)` | Improve boundary | Call existing production `fetchCapitalData` directly, as startup does. Keep authentication, endpoint/offset/limit, redirect/deadline signal, first-capital mapping, malformed neighbors, progress errors, bounded/inconsistent pagination and independent/sticky country facts. Remove fake transaction/client plumbing. Request assertions now sit outside the Fetch double, so importer error handling cannot swallow them. |
| `import-capitals`: conflict-safe SQL pattern / fake rollback and connection failure | Remove duplicates | `postgres` repeat import preserves edits, restores explicit deletes, counts conflicts and rolls back earlier inserts after a later failure. SQL-looking imported names now persist literally. Real initialization owns capital/metadata/marker rollback and retry; controlled startup connection/COMMIT errors remain in `initialize-database`. |
| `import-capitals`: partial-metadata publication matrix | Remove | The local `published` variable was assigned only after an awaited success; its identity on rejection proved test control flow. Parser units retain explicit failure/progress contracts; real initialization failures assert unchanged capitals and empty metadata/import state before retry. |
| `db`: immediate readiness plus transient recovery | Merge | One two-row case checks zero or multiple failures and stopping once ready. Keep bounded exhaustion, every supported transient category, safe actionable permanent/unknown errors, default budget and invalid options. Retry counts describe observable startup policy. |
| `initialize-database`: warm query count and metadata/marker/COMMIT failure matrix | Improve / narrow | Warm startup asserts read-only queries instead of exactly three statements; real fresh-pool keyless boot proves persistence/no network. Real PG owns metadata/marker failures. Keep uncertain COMMIT, missing-key cleanup and sanitized connection failures as controlled unit faults. |
| `reset`: fake success with BEGIN/DELETE/COMMIT order | Remove duplicate | `reset-postgres` owns restored defaults, new IDs, response enrichment and atomic rollback. Default snapshot validation remains a separate config contract. |
| `reset`: repeated write failures plus connection/COMMIT failures | Merge / improve | One small fault table checks safe 500, failed-client disposal and an actually successful later request after each fault. The old “later requests can run” case only repeated failures. Keep explicit confirmation/media validation and gated overlap/409/recovery. No fake claim of rollback/persistence. |
| `postgres`: invalid-update and repeated missing-record matrix inside CRUD | Remove duplicates | HTTP unit tables own pre-SQL rejection and 404 payloads/max valid IDs. PG still verifies actual update contents, deletion, absence on lookup and conflict non-mutation. Keep schema reapplication, all constraints, low-level import, DB-backed health and metadata behavior. Add duplicate-ID rejection using `OVERRIDING SYSTEM VALUE` so primary-key removal cannot hide behind identity generation. |
| `initialization-postgres`: all ten cases | Keep | Fresh seed/marker/metadata, new-pool keyless restart, CRUD/deleted/empty preservation, legacy backfill, CRUD during slow fetch, failed later page, three write targets/rollback/retry, invalid source, successful and failed competing initializers, reset preserving metadata/state. Similar setup protects distinct failure windows. |
| `reset-postgres`: all four cases | Keep | Empty/edited/deleted/conflicting data, explicit repeat with new IDs, insert failure after DELETE preserving every row/ID, concurrent-writer lock timeout and recovery. |
| `deployment` and `health`: all cases | Keep | Exact production CORS/preflights, fail-closed default/config, body/text/encoded Unicode limits, shared write/reset budgets despite spoofed headers, available reads, window expiry and DB-dependent safe health failure. Development wildcard CORS remains a separate default contract. |

## Boundaries and trade-offs

The three PostgreSQL suites still own all 20 integration subcases. They use
unique temporary schemas in an explicitly selected disposable database, never a
fallback to `DATABASE_URL`. Parser tests mock only REST Countries. HTTP tests
retain small fixed-result/fault DB doubles for transport, no-query validation,
uncertain commits and request overlap; these do not prove SQL persistence.
No shared harness, new export or production test hook was introduced.

`importCapitals` has no production caller since #69; startup calls
`initializeDatabase` and its shared fetch/insert functions. The existing low-level
wrapper is still covered in PostgreSQL. Removing it is deferred because this
issue excludes product changes. No product defect was identified. Real upstream
availability, listening-socket request deadlines and hosted proxy behavior remain
outside inject/database proof; no deployment or browser change is claimed.

## Validation

Node 24.22.1 / npm 11.19.1. `npm ci`, baseline `npm run check` and `npm test` passed.
Before schema writes, a query inside the newly started PostgreSQL 16 container
confirmed `capitals_issue75_test`, server **16.15**, and zero public tables. It used
loopback port 55432, tmpfs storage and no development volumes. Baseline: backend
81 passed, frontend units 83 passed, branding HTTP 2 passed, no skipped tests.

After: `npm run check`, `npm test` with explicit `TEST_DATABASE_URL` and
`git diff --check` passed. Backend: 68 passed, zero skipped; frontend: 83 units
and 2 branding tests passed. All SQL, restart, migration, transaction and lock
checks ran against that same disposable PostgreSQL 16 service. Existing Vite
bundle warning and Vite/esbuild development advisories remain; production
`npm audit --omit=dev` found zero vulnerabilities. No dependencies changed.

| Structure | Before | After |
| --- | ---: | ---: |
| Backend test files | 10 | 10 |
| Top-level declarations | 61 | 48 |
| Integration subcases | 20 | 20 |
| Executed tests (including three parent tests) | 81 | 68 |
| Backend test lines (including inline fixtures) | 1,476 | 1,259 |
| Product lines changed | — | 0 |

No reduction target or comparable speedup is claimed. Full diff and staged files
are reviewed before publication; PR CI is checked for the actual head commit.

## Preservation experiments

Six faults were applied one at a time **only in a temporary copy**; each failed
in its intended remaining owner. Restoring the sources made all 68 backend tests
pass there again. No mutation infrastructure is checked in.

| Fault | Remaining detector |
| --- | --- |
| Commit reset immediately after DELETE | `reset-postgres`: insert failure must preserve all original rows and IDs |
| Remove primary key while retaining generated IDs | `postgres`: explicit duplicate identity must fail with 23505 |
| Remove latitude CHECK constraint | `postgres`: invalid coordinates must be rejected by SQL |
| Fetch external data on completed startup | `initialization-postgres`: fresh-pool keyless restart must succeed without network |
| Increase write/reset budgets so limits do not apply at their promised thresholds | `deployment`: the next write must return 429 |
| Read the second capital instead of the first | `import-capitals`: mapping/statistics and malformed-neighbor assertions |

A preliminary ROLLBACK-to-COMMIT substitution did not change the tested failed
transaction outcome: PostgreSQL rolls back an aborted transaction even on COMMIT.
The premature-commit experiment above exercises actual loss of atomicity instead;
no extra test was added just to reject an equivalent failed-transaction outcome.
