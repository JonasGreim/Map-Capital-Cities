# Browser test audit — Issue #74

Read-only baseline: `963e75e` (merged #77 / #73), verified against live `main`.
Issue #74 had no comments. Reviewed all browser owners/helpers, runner, CI,
`docs/testing.md`, assignment PDF, production Map/App/form/action/loading/marker
owners and existing unit contracts before consolidation. No product changes.

## Decisions and preservation ledger

Each row names the observable regression and its remaining primary owner. The
old suites mostly replay entire interactions at 1440/390/320px; responsive proof
only needs repetition where geometry or pane lifecycle actually changes.

| Baseline owner | Decision | Detectable regression / remaining proof |
| --- | --- | --- |
| `sidebar` | Consolidate | Search counts/empty results, CRUD, pending/error drafts and native dialog focus → `smoke`; API loading/retry/empty → `loading`; action-menu dismissal/edge geometry → `layout`. |
| `sidebar-controls` | Consolidate | Combobox keyboard, commit versus browsing, dismissal, focus, clear-search independence → `layout`; continent/list/marker intersection → `map`. Remove repeated all-option inventory (unit filter owner already tests values). |
| `sidebar-rail` | Consolidate | Collapsed search overlay, Escape/outside/Tab dismissal, focus, retained query and scroll → `layout`; actual canvas resizing/identity → `map`. Remove exact rail width/background assertions: styling details, not independent interaction contracts. |
| `sidebar-polish` | Consolidate | Menus stay anchored without moving rows, close on scroll/resize; offscreen selection reveal → `layout`/`map`; success timing/restart and persistent failures → `smoke`. Remove internal listener/timer counts and synthetic store-copy updates. |
| `mobile-navigation` | Consolidate | Initial Map, roving keyboard tabs, hidden focus exclusion, repeated selection after resize, retained search/filter/scroll/color, canvas identity → `map`/`layout`. CRUD/picker/reset repetitions move to their owners. Keep 700px crossing both ways and safe-area check. |
| `mobile-responsive` | Consolidate | 390/320, short landscape, 200% text, clipped controls, long popup/facts, attribution, swatches and reduced keyboard space → `layout`/`map`. Replace instrumented edge flights with real drag/keyboard navigation and popup bounds. |
| `map-selection` | Consolidate | List → map → selected row, repeat selection, popup focus/Escape and resize before selection → `map`. Selected edits/deletes covered there once; interrupted-flight reconciliation remains in `markers.test.tsx`. Remove exact private flight-call inventory. |
| `map-navigation` | Consolidate | Zoom/pan/reset visibly move markers, reset preserves search/filter/color and makes no writes → `map`. Picking hides controls → `coordinate-picker`. Remove artificial min/max setter configuration and store-object equality; no user sets those limits. |
| `continents` | Consolidate | Search affects list only; continent hides/disables markers and clears excluded selection; restore identity/color; active-filter CRUD/reset → `map`. Multi-continent/unknown matching remains in `continents.test.tsx`. |
| `marker-colors` | Consolidate | Real swatches, reload persistence, edit retention, delete/reset cleanup (including reused IDs), blocked browser Storage → `map`. Encoding/invalid storage matrices remain in `marker-color-storage.test.tsx`; repeat failures do not need every viewport. |
| `popup-actions` | Consolidate | Map popup → shared edit/delete, pending/error preservation, safe text/changed facts, filter exclusion, focus after removed trigger → `map`. Shared form validation/error transport → `smoke` and existing API/mutation units; no 3×2 viewport/collapse × HTTP-status matrix. |
| `reset` | Consolidate | Cancel makes no write, confirmation payload, pending duplicate protection, safe failure, lost response/read-only recovery → `smoke`; real markers/colors cleared without canvas/camera replacement → `map`; compact consequence dialog reachable → `layout`. |
| `toast` | Consolidate | Stable polite region, success only after confirmed write, clear on next action, 3-second expiry/restart, reduced motion and viewport anchoring → `smoke`/`layout`. Remove injected context setter: replacement during an open notice is unreachable through normal UI (entry points clear it). |
| `loading` | Improve | Real React loading/slow explanation, no layout shift, reduced motion, hidden-pane error/retry, empty success and timer disappearance → `loading`. Remove injected StrictMode/root/timer counters and fabricated AbortSignal timeout. Request sharing/deadline transport already owned by `loading.test.tsx`/`api.test.tsx`. |
| `coordinate-picker` | Improve | Real canvas handoff, draft/Cancel/Escape, repeat picks, pan while picking, manual correction, failed edit, cursor/preview cleanup, breakpoint crossing and WebGL-loss cancellation retained once at 390px. Exact coordinate formatting/callback/listener ordering belongs to `coordinate-picker.test.tsx`. Remove invented inactive prop and external store reset/removal actions (no UI entry point); reset/store/marker contracts also remain in `reset.test.tsx`/`markers.test.tsx`. |
| `map-errors` | Improve | Browser WebGL construction failure and intercepted initial-style failure preserve list/manual form; real WebGL loss/restoration recovers navigation in picker owner. No injected `.fire`, `.setStyle`, React root or listener counts. WebGL recovery alone must leave a failed style unavailable; restoring network plus a real reload recovers it. |
| `flags` | Improve | Keep decoded real CDN image, held loading globe, HTTP-failure fallback, edited country reload/cache reuse and fixed image dimensions. Run functional flow once on desktop; narrow popup layout belongs to `map`. Remove its unrelated create/delete/color replay. |
| `branding` | Improve | Keep natural Tab/native home reload, globe motion/reduced motion and SVG decode. Desktop flow once, 320px header geometry separately. HTTP document/favicon contracts remain in `branding.test.ts`. |
| `deployment` | Keep | Separate opt-in real API/PostgreSQL/CORS production-build smoke, requires explicitly selected disposable API. Not CI fixture proof; no execution against development DB. Use pinned workspace Playwright. |

The new `smoke` owner exercises real React/native browser behavior with a
stateful API fixture, no Mapbox token, no REST Countries credentials and no DB.
This catches missing fetch/render wiring, broken forms, incorrect mutation IDs,
pending dismissal, lost-response retry writes and focus regressions that SSR or
store-only units cannot establish. The local map owners retain real Mapbox
rendering and network prerequisites. They do not claim real API persistence.

## Infrastructure

One pinned Playwright dependency and one runner; fresh browser contexts per
suite, bounded actions/navigation/suites, cleanup in `finally` and process-level
deadline. No source rewriting, Vite dependency-path discovery, React/store
injection or production test hooks. Shared helper owns only fixture HTTP,
focus/geometry and browser-event utilities. Fixture failures are explicit;
fixture payloads/targets and per-flow write counts are checked. Responsive checks use representative dimensions
instead of replaying every mutation at every width.

## Validation

Local execution used Node 24.22.1, npm 11.19.1, Playwright 1.62.1 and its
Chromium revision 1234 / Chrome Headless Shell 151.0.7922.34.

- `npm ci`, `npm run check`, `npm test` and `git diff --check` passed. Default
  tests: 58 backend passed with 3 PostgreSQL suites skipped (no explicitly
  selected `TEST_DATABASE_URL`); 83 frontend units and 2 Vite HTTP branding tests
  passed. Browser fixtures are not presented as SQL evidence. PostgreSQL CI is
  preserved and is reported separately in the PR.
- `npm run test:browser:smoke -w frontend` passed with both `VITE_MAPBOX_TOKEN`
  and `RESTCOUNTRIES_API_KEY` explicitly empty: smoke 2.1s, loading 2.2s on this
  machine. The runner also rejects any external request in these suites.
- `npm run test:browser:full -w frontend` passed all nine suites with the local
  public token and real Mapbox/CDN resources. Following the final retention
  review, changed `layout,map` suites passed again (5.1s / 37.2s), including
  native skip-link navigation, retained mobile scroll and normal/reduced motion.
  The final smoke rerun also covers crossing an old notice's deadline before
  the replacement notice expires. Timings are diagnostic, not thresholds.
- Two isolated copies under `/tmp` supplied negative controls: disabling search
  failed the exact visible-name assertion; dropping a confirmed created record
  from the store failed waiting for its new list row. Neither modified this
  checkout or introduced a checked-in test seam. The same flows pass normally.
- Initial trial failures were test assumptions (hidden-role locator, waiting for
  React's breakpoint commit, Escape focus from outside a popup, a picker click
  obstructed by a real marker, and a Storage fixture affecting its own session
  flags). They were corrected at the browser/fixture boundary. Application,
  backend and database sources are unchanged.
- `npm audit --omit=dev` found zero vulnerabilities. Installation still reports
  the existing Vite/esbuild development advisories; no forced upgrade.

Before: 19 `.browser.mjs` files including opt-in deployment, 21 runner entries,
4,127 browser/helper/runner lines. After: 9 such files, 9 full runner entries
(including the 2 CI smoke owners), 1,324 browser/helper/runner lines. These are
structure diagnostics, not a deletion target or coverage metric. No comparable
baseline runtime was measured, so no percentage speedup is claimed. Production
LOC changed: zero.

The opt-in real API/PostgreSQL production-build `deployment` smoke was not run:
no disposable full-stack API was selected for this browser-only refactor. Local
PostgreSQL evidence is therefore unavailable; use the existing CI service/test
results. Physical mobile devices and assistive-technology announcements remain
manual verification, as before.
