# Mobile navigation validation — Issue #38

Base: `165176832237711b0478f4331353e88fde89395f` (merged PR #45).
Scope: [Issue #38](https://github.com/JonasGreim/Map-Capital-Cities/issues/38),
approved [decision #32](https://github.com/JonasGreim/Map-Capital-Cities/issues/32)
and [Variant B mockup](https://github.com/JonasGreim/Map-Capital-Cities/issues/38#issuecomment-6401579639).
[Issue #39](https://github.com/JonasGreim/Map-Capital-Cities/issues/39) remains a separate QA pass;
#34's final documentation/screenshots remain separate. Neither issue was modified.

## Implementation and lifecycle

- `AppLayout` owns `view: "map" | "capitals"`, initially Map, independently of
  the existing desktop `sidebarOpen`. A subscribed `(max-width: 700px)` media
  query supplies visibility and semantics; CSS supplies the responsive layout.
- One `CapitalList`, one `Map`, one existing action/dialog provider and the
  existing Zustand/API store remain mounted. No new dependency, route, API,
  schema, store field, icon library or animation was added.
- Inactive panes use native `hidden` with an explicit CSS display rule. Their
  descendants leave both native focus navigation and the accessibility tree.
  The map canvas/markers remain in the DOM. Map resize observation skips hidden
  or zero-sized containers; listeners/observer belong to the original map effect.
- A row activates Map and selects the capital in the same React interaction.
  After the visible layout commits, `map.resize()` runs before consuming the
  store's `selectionVersion`. Repeating the same ID remains a new request.
  Merely returning to Map does not replay an applied selection or its flight.
  Reduced motion retains the existing 0 ms camera duration (900 ms otherwise).
- Popup fitting uses the actual map bounds, avoiding repeat flights caused by
  the former blanket 64px top exclusion when a popup already fits the map.
  Camera math and 32×32 square markers otherwise retain their existing behavior.
- Marker activation stays on Map. A pending marker selection is revealed once
  inside the list scroller when Capitals opens. Later tab round trips retain a
  manually chosen scroll offset. Filtered-out rows never override search/filter.
- The automatic tab pattern has one tab stop, Left/Right wrapping, Home/End,
  native Enter/Space, panel relationships and visible focus. Manual tab changes
  retain focus on the tab; row activation focuses the popup's selected swatch.
  Breakpoint changes recover focus from hidden controls. Missing Mapbox falls
  back to the visible map panel/message after a row activation.
- Picking temporarily derives Map as the active view without changing the
  stored view. Native form suspension, draft, callbacks, preview and explicit
  save behavior remain shared. Tabs are disabled during picking; Cancel/Escape
  remain reachable. Completion/cancellation returns to the original view/form.
- The native reset dialog is portaled outside the hidden list pane, so changing
  viewport size cannot hide an open modal while leaving the document inert.
- The shell uses `100dvh`, a flex header and a single grid content cell. The
  list scrolls internally; short landscape can also scroll its own controls.
  Navigation is fixed, 64px excluding the bottom safe area. The existing toast
  reads the same variable and adds the safe area separately.

## Tests and migration of existing browser fixtures

The new `mobile-navigation.browser.mjs` checks initial Map, keyboard semantics,
hidden focus exclusion, resize-before-flight, repeated selection, reduced motion,
search/filter/scroll/camera/color retention, no extra tab-triggered flights or
GET requests, one actual Mapbox creation, original canvas/marker identity and
stable map listener counts across tab cycles. It also checks mocked CRUD,
validation/server failure, picker draft/Cancel/Escape, focus, reset across a
breakpoint, independent desktop collapse state, popup bounds and a 34px safe area.

Existing fixtures explicitly navigate to the relevant pane using `showView`.
The shared `viewButton` maps collapse/expand intentions to Map/Capitals only on
mobile, while keeping actual desktop toggle coverage. Assertions about retained
state can inspect the original hidden DOM; pointer/focus actions use the active
pane. Other intentional adaptations:

- Marker-to-list reveal is measured after opening Capitals.
- Map/flag dimensions are measured in the visible pane.
- Desktop skip-link checks remain; mobile checks use the keyboard tab control.
- A repeated already-open popup need not steal focus from the navigation tab;
  newly opened popups retain the original swatch-focus check.
- Popup-initiated deletion/exclusion on mobile recovers focus to the map rather
  than a hidden Add button. Camera baselines wait for the visible map layout.
- Picking retains desktop collapse coverage and checks disabled mobile tabs.
- Toast geometry includes the real navigation height, retaining duration,
  timer/replacement, live region, opacity-only and safe-area assertions.

No suite or viewport was removed or disabled. The runner can filter named suites
with `BROWSER_SUITES` and aggregates failures while closing each isolated context.
Instrumentation exists only in intercepted Vite responses, never production code.

## Execution evidence

Node **24.22.1**, npm **11.19.1**; `npm ci`, `npm run check`, `npm test`
and `git diff --check` completed successfully. All **15 Chromium suites passed**
in the final regression and focused navigation runs (14 existing suites plus
mobile-navigation). The final navigation run also covers short-height Capitals
and native form cancellation at every mobile size in the table. Local unit execution: **129 passed, 2 skipped, 0 failed**
(43 backend, 84 frontend unit, 2 branding HTTP tests). The two PostgreSQL
integration tests were skipped without their disposable test database settings.
No normal development database was read, reset or mutated.

Chromium uses real Mapbox/WebGL, real native dialogs and controlled capital API
reads/writes. The flags suite also confirmed real German/Czech CDN images.
The toast-only suite intentionally removes Mapbox configuration; picker/error
fixtures additionally cover missing configuration and controlled failures.
These mocks do not establish PostgreSQL integration. Browser checks are local;
the existing secret-free GitHub CI checks static/build/unit behavior.

| Viewport | Checks |
| --- | --- |
| 1440×900 | Desktop split/toggle; full existing regressions |
| 768×1024 | Desktop above breakpoint, retained map/canvas/markers |
| 700×844 | Mobile boundary, navigation/layout/popup bounds |
| 390×844 | Mobile integration and all existing regressions |
| 320×568 | Mobile integration, popup reachability and all regressions |
| 667×375 | Short landscape, map/popup bounds, attribution and document overflow |
| 701×844 | Crossing back to desktop, then back to 390px |

All recorded layout scenarios retained one Mapbox instance, the original canvas
and marker nodes, 32×32 visible regular markers and accessible attribution,
without horizontal or vertical document overflow. The dedicated navigation
scenario performs exactly one initial capital GET through all tab/viewport cycles.

`npm audit` reports two existing toolchain advisories: Vite (high) and its older
esbuild (moderate). The suggested fix upgrades Vite to a new major, outside this
issue's pinned-stack scope. Dependencies and lockfile were left unchanged.
Vite's existing large-bundle warning remains.

## Screenshots and scoped visual audit

Screenshots are local generated evidence, deliberately outside Git, under
`/tmp/issue38-browser`. Representative files:

- `mobile-map-390.png`
- `mobile-capitals-390.png`
- `mobile-search-390.png`
- `mobile-popup-390.png` and `mobile-popup-320-568.png`
- `mobile-form-390.png` (validation/draft state) and `picker-form-320.png`
- `desktop-1440.png`
- `mobile-popup-667-375.png`

Compared with the approved mockup: Map is first, each view occupies the space
between the existing brand header and fixed light bottom navigation, Capitals
retains search/filter/actions/rows, and Teal plus a visible indicator identifies
the active tab. Desktop keeps its split layout. Existing extra popup facts and
CRUD/picker capabilities are retained as explicitly requested. Fixture globe
flags represent records without `flagCode`; real flags are separately tested.
Device chrome and invented mockup controls were not reproduced.

The scoped Impeccable audit found no additional blocking visual drift in these
screenshots. Preserve the shared light/Teal controls, native dialogs, consistent
labels and fixed square markers. This inspection does not certify WCAG or
real-device behavior.

## Concrete remaining checks for #39

- Real iOS/Android browser chrome, virtual keyboard, touch and safe areas;
  current evidence uses desktop Chromium viewports and an emulated safe area.
- Screen-reader behavior on actual mobile assistive technology and zoomed text.
- Extended long-name/long-country/facts combinations, especially at 320px and
  short heights. In 667×375, reaching swatches scrolls the popup title out of its
  internal content area; the close control remains visible and the title/menu
  can be reached by scrolling back. Refine that existing interaction in #39.
- Broader visual alignment with the mockup, short-height Capitals control
  scrolling and real keyboard-driven viewport changes.
- Final product screenshots/documentation polish belongs to #34.
