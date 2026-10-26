# Repository cleanup — Issue #61

Audited on **26 October 2026**, against verified GitHub `main`
`350dd3500f415153b291020e30c9317a0a4dafb6`. Prerequisite #58 was merged by
[PR #66](https://github.com/JonasGreim/Map-Capital-Cities/pull/66).
The live issue had no comments and no open PR overlapped this work. The local
assignment PDF was readable. Work used a separate clone with its own physical
`npm ci` installation; the active checkout, servers and development DB were untouched.

## Keep / Remove / Simplify / Defer

Ordered by benefit and regression risk; only the low-risk removals and
simplifications below were implemented.

| Decision | Files / evidence | Benefit and risk |
| --- | --- | --- |
| **KEEP** | `App.tsx`, `CapitalList.tsx`, `CapitalActions.tsx`, dialogs, `Map.tsx`, `capital-markers.ts`, `capital-store.ts` | Existing ownership separates layout, transient actions, persistence and Mapbox lifecycle. Every application module has an importer or is an entry point. Retain these boundaries and all behavior. |
| **KEEP** | `frontend/src/styles.css`, `frontend/public/favicon.svg`, `frontend/index.html` | Reference scan found all 92 local CSS class names in application sources; Mapbox selectors also target library DOM. This is reference evidence, not proof every rule executes. No safe unused selector/asset deletion was established; preserve cascade, responsive/focus/reduced-motion rules and 32×32 markers. |
| **KEEP** | Root/workspace manifests, TS configs, ESLint, `.nvmrc`, CI | Both app and test configurations are strict. All remaining direct dependencies have application, build, test, lint or startup consumers. Shared dev tools are declared per workspace for independent Docker builds; npm deduplicates them. JS configs/browser runners remain appropriate. |
| **KEEP** | `compose.yaml`, `docker-compose.yml`, `.devcontainer/`, Dockerfiles, Nginx, `.dockerignore` | Full-stack demo and DB-only development intentionally coexist. Preserve services, volume isolation, environment loading, ports and all startup commands. |
| **KEEP** | `backend/src`, `db/schema.sql`, `db/default-capitals.json` | Single-table fields, identity, uniqueness and coordinate checks match the assignment and existing route/store contracts. DB-backed health and importer remain intact. No schema, API, reset or import changes are justified by this cleanup. |
| **REMOVE** | `frontend/package.json`, `package-lock.json`: `@types/mapbox-gl` and its sole dependency `@types/geojson` | Locked `mapbox-gl@3.32.0` provides `dist/mapbox-gl.d.ts`. Clean installation, all typechecks and builds succeed without the separate declarations. Exactly two lock entries removed; no retained package version changed. No application file, function, asset or QA report was deleted. |
| **SIMPLIFY** | `MapNavigation.tsx`, `coordinate-picker.ts`, `coordinate-picker.test.tsx` | Use named type-only `Map` / `MapMouseEvent` imports, with `MapboxMap` alias. TypeScript previously treated the default imports as unused while resolving the ambient namespace. Explicit imports pass unused-symbol checks and erase from runtime output. |
| **SIMPLIFY** | `ContinentSelect.tsx` | `ContinentIcon` has only same-file consumers; remove its unnecessary export while retaining the component and identical markup. |
| **SIMPLIFY** | `docs/technical-reference.md` | Replace stale “native dropdown” wording with the implemented combobox, icons and keyboard/type-ahead behavior. Existing screenshot placeholders remain for #62. |
| **DEFER** | `frontend/src/api.ts`; duplicated frontend/backend capital/currency types and metadata normalization | Mutation result assertions follow runtime guards; object assertions follow shape checks. No application `any` type or unguarded double assertion was found. A shared package or mutation overload refactor adds cross-workspace/API churn without sufficient benefit here. Test-only Mapbox doubles deliberately use assertions. |
| **DEFER** | Large map/list files, repeated overlay focus/dismissal logic, CSS consolidation | These have different lifecycle and focus responsibilities. Keep regression-tested behavior; no component split, generic overlay abstraction, CSS move or broad formatting pass. |
| **DEFER** | Vite/esbuild advisories, ESLint support warning, bundle-size warning | Separate reviewed tooling maintenance. No major upgrade, audit force-fix, new dependency, bundling redesign or warning suppression. |
| **DEFER** | Full live-service acceptance, final screenshots, physical-device checks | Continue in #62 after review/merge. Historical reports retain their original scope and commits. |

## Repository and documentation evidence

- Inspected the 132 tracked files, including agent/tool configuration; scanned
  all 77 application/test modules for references. No unresolved literal local
  module import or unreferenced application module was found. Tests referenced
  by scripts/browser runner remain useful; no redundant test suite was removed.
- README stays concise and links to development, technical, testing and submission
  docs. All **63 rendered local links/anchors** in README and the existing ten docs
  passed before this report was added. Final documentation links were rechecked.
  Historical QA/animation reports remain historical; their old filenames and UI
  observations are not rewritten as current validation. Screenshot TODOs are
  intentional; no stale application TODO/FIXME needed deletion.
- `.gitignore` covers `.env`, the private assignment PDF, dependencies, builds and
  logs. `.dockerignore` allows only build inputs. Browser screenshots and temporary
  audit/build output stayed outside the checkout. No configured credential values
  were found in tracked files; final staged files were reviewed. This scoped scan
  is not an exhaustive Git-history security audit.

## Actual validation

- Node **24.22.1**, npm **11.19.1**; final-lockfile `npm ci` passed with 392 packages.
- `npm run check` passed: ESLint, both workspace app/test typechecks and builds.
- `npm test` passed: **141 passed, 2 skipped, 0 failed**. The two existing optional
  PostgreSQL suites skipped because no disposable `TEST_DATABASE_URL` was supplied.
  No database was started, reset or queried for this cleanup.
- Additional `tsc -p frontend/tsconfig.test.json --noUnusedLocals --noUnusedParameters`
  and the equivalent backend command passed; these diagnostic flags were not added
  to project configuration.
- Production frontend artifacts (`index.html`, favicon, CSS and JS) are
  **byte-for-byte identical** to an original-source build from the same base,
  using the locked toolchain and the same empty token environment. No CSS changed.
- Existing isolated Chromium suites **map-navigation**, **sidebar-controls** and
  **continents** passed with real Mapbox and intercepted capital traffic. They
  cover 1440/1024px desktop, 390/320px mobile (plus 701px sidebar controls),
  keyboard/type-ahead, dialogs, filtering, colors, stable marker/canvas identities,
  one map instance, camera-only reset, picking and retained state. No page errors
  or layout overflow were reported. Screenshots stayed in `/tmp`.
  These browser fixtures do not establish PostgreSQL or live CRUD integration.
- `npm audit`: **2 affected development packages**, Vite high and esbuild moderate;
  `npm audit --omit=dev`: **0 vulnerabilities**. Existing ESLint 9 support and Vite
  bundle-size warnings remain. npm also reports the two existing esbuild install
  scripts as outside `allowScripts`; actual build execution passed.
- `git diff --check` passed. Startup/Compose definitions and npm scripts are
  unchanged, so no service startup or Docker rebuild was needed for this scope.

## Readiness for #62

**Ready for the final full functionality test after this PR is reviewed and merged.**
No cleanup regression or new failing/skipped suite was found. #62 should verify
fresh isolated full-stack startup, actual PostgreSQL CRUD/reset and persistence,
REST Countries import, Mapbox/network failure recovery, all desktop/mobile flows
and final README screenshots. Existing tooling advisories and physical-device
limits remain documented; this cleanup does not claim final end-to-end acceptance.
