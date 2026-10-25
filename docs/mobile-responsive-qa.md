# Variant B responsive QA — Issue #39

Base: `31efb95e8e1609c11bffc3955872f4d4de77b5ee` (merged PR #46).
References: [#39](https://github.com/JonasGreim/Map-Capital-Cities/issues/39),
[#38](https://github.com/JonasGreim/Map-Capital-Cities/issues/38), approved
[Variant B](https://github.com/JonasGreim/Map-Capital-Cities/issues/38#issuecomment-6401579639)
and [previous validation](mobile-navigation-validation.md).

The initial audit used unchanged main, real Mapbox/WebGL and isolated Chromium,
with **every capital API read/write intercepted**. No backend or development DB
was started or mutated. Screenshots, raw geometry and logs live outside Git in
`/tmp/issue39-browser` and `/tmp/issue39-*.log` / `*.json`.

## Confirmed findings and corrections

| Area | Severity | Reproduction / before | Correction / after |
| --- | --- | --- | --- |
| Popup bounds | Major | 568×320 → Capitals → Berlin: popup top 36.8px, map top 57.8px; header clipped by ~21px | Remove 160px minimum; short maps reserve 80px for offset/tip/camera, maps ≥300px retain the existing 112px clearance. Popup remains inside map. |
| Popup focus | Major | Open very long capital/country at 1440px or 320px: selected swatch receives focus below the internal viewport (`preventScroll`) | Reveal the focused button **only inside the popup scroller**, without document scrolling or map movement. New suite fails on unchanged main at this assertion. |
| Large text | Major | 320×568, root text 200%: header consumes ~486px, map shrinks to ~18px, fixed 64px tabs clip labels; popup heading column collapses to 0px | Bound header to 35% with accessible internal scrolling and safe alignment; navigation grows with text; cap decorative popup spacing and keep icon controls at 40px. Text itself still enlarges and wraps. |
| Short popup context | Minor | 667×375 → Berlin → scroll to Gold: 135px internal scroll hides title, flag and action trigger | Compact existing spacing/type and align the existing color label beside its swatches at viewport heights ≤500px, retain all facts and 40px swatches; ordinary Berlin context remains visible with colors. |
| Compact attribution | Minor | 768px and mobile: global 44px button minimum exceeds Mapbox's 24px wrapper; bottom of button is clipped | Match button and wrapper to a complete 44px touch target, keep existing info icon and links. |

No new popup structure, sticky header, animation, map instance or mobile
navigation architecture. Normal markers remain exactly 32×32px with the same
four colors. API/backend/schema/dependencies remain unchanged.

Long names, unbroken words, accents, multiple continents, long currency labels
and missing metadata wrap without horizontal overflow or data truncation.
For unusually long content and 568×320, context and colors still require internal
scrolling; scrolling back or keyboard navigation reaches the title/menu. Keeping
an arbitrarily tall header sticky would obscure the reading area, so it was not
introduced. The selected color is immediately reachable on opening.

## Scenarios and matrix

| Viewport | Result / focus |
| --- | --- |
| 1440×900 | Pass — Desktop split/toggle, popups and all map edges/corners |
| 768×1024 | Pass — Tablet, compact attribution, retained original map |
| 701×844 / 700×844 | Pass — Both sides of breakpoint, long popup content |
| 390×844 | Pass — Initial Map, Capitals, search, popup, CRUD/toast |
| 375×667 | Pass — Smaller phone, scrolling and popup bounds |
| 320×568 | Pass — Narrow phone, long text, form validation and 200% root text |
| 667×375 | Pass — Landscape list, compact popup context and colors |
| 568×320 | Pass — Very short map, popup clipping regression and dialog actions |
| 390×400 | Pass — Focused search/clear/results with simulated keyboard space |

The dedicated `mobile-responsive` suite checks actual DOM rectangles, clipping
ancestors and center-point hit testing. It exercises all four swatches, close and
popup actions; eight real marker clicks at edges/corners per viewport; no repeated
fit flights; attribution expansion/links; last-row actions; original canvas,
connected marker nodes, one map creation, 32px marker geometry, one initial GET,
200% root-text reflow and reduced-motion toast duration (80ms). Dialog validation,
Escape and action reachability are checked across mobile/desktop/short-height
changes. A single mocked create supplies the toast screenshot.

The existing suites cover tab/tabpanel ARIA relationships and hidden focus,
arrows/Home/End/Enter/Space, Tab/Shift+Tab/Escape, menus, create/edit/delete/reset,
server/conflict errors and retained drafts, picker completion/Cancel/Escape,
breakpoint changes with a modal, filters and `revealedSelection`, repeated and
interrupted selections, pan/zoom, safe-area emulation, listener/canvas/marker
identity and no tab-triggered GET or camera flight. No reproducible defect in
these state/navigation paths justified changing them.

Visual comparison preserves the approved Map-first flow, globe/header, light
teal controls, separate Capitals screen and labeled fixed tabs. Existing facts,
popup CRUD and coordinate picking remain. Device chrome and invented map controls
from the mockup were not copied.

## Execution

Node **24.22.1**, npm **11.19.1**, installed Chromium **156.0.8078.4**
(Playwright tooling supplied externally; no project dependency added).

- `npm ci`: passed; lockfile/dependencies unchanged.
- `npm run check`: passed (lint, both TypeScript workspaces, production builds).
- `npm test`: **129 passed, 2 skipped, 0 failed** (43 backend, 84 frontend,
  2 branding HTTP tests). PostgreSQL's two optional integration tests skipped
  because no disposable test database was configured.
- `mobile-responsive`: **all nine viewports passed**, including popup geometry,
  edges/corners at zoom 3 and list selection at zoom 4.5, long content, 200% root
  text and 390×400 simulated keyboard. The final focused follow-up also passed
  header start/end scroll reachability and clean screenshots after toast expiry.
- Existing Chromium suites: **15/15 passed**, including mobile-navigation,
  toast, coordinate-picker, marker-colors, branding, flags (real DE/CZ CDN),
  selection, sidebar, reset, continents, sidebar-polish, popup-actions and all
  three map-error modes. Together with the new suite: **16/16 passed**.
  No page errors or unexplained retry-only pass in the final runs.
- `git diff --check`: passed.

Primary logs: `/tmp/issue39-responsive-final.log`,
`/tmp/issue39-text-final.log`, `/tmp/issue39-regressions-final.log`,
`/tmp/issue39-check-final-source.log`, `/tmp/issue39-tests-final-source.log`.
The new suite was also run against main via a temporary Vite transform and failed
as expected at the invisible focused swatch (`/tmp/issue39-red.log`).

The existing Vite large-bundle warning remains. `npm audit` reports only the
existing Vite/esbuild development-tool advisories (1 high, 1 moderate);
`npm audit --omit=dev` reports **0**. No dependency upgrade was made.

Diagnostic failures were investigated, not accepted by repetition: initial CLI
Git access lacked credentials (connected GitHub used instead); sandbox networking
blocked the first install, and the first `npm test` could not create its tsx IPC
pipe. Installation/tests were rerun with the required access. Initial Chromium
launch needed the installed executable specified explicitly. Early new-fixture
failures exposed assumptions about retained color, zero layout boxes in hidden
panels, an already-open/responsively collapsed attribution, attribution-covered
marker positions and the toast's intentional pointer transparency. The fixture now
checks the selected swatch, CSS plus visible marker geometry and actual attribution
content. The first broad popup-height adjustment exposed a 701px globe-projection
regression; retaining the normal clearance corrected it. At zoom 3, short-map
clearance needed 80px rather than the initial 64px; the compact color row keeps
ordinary context visible with that reserve. A 4px context clipping after focus
reveal was removed by reducing fact-row gaps, preserving 12px fact text. One
existing-suite run was interrupted before changing CSS, then restarted in full. No existing assertion
was removed or relaxed. Logs retain each diagnostic run.

## Screenshots and limits

All paths below are under `/tmp/issue39-browser/` (local evidence, not PR assets):

- `responsive-map-390.png`, `responsive-capitals-390.png`, `responsive-search-390.png`
- `responsive-popup-1-390-844.png`, `responsive-popup-1-320-568.png`
- `responsive-popup-1-667-375.png`, `responsive-capitals-667.png`
- `responsive-popup-1-568-320.png`, `responsive-popup-2-320-568.png` (long data)
- `responsive-create-320.png`, `responsive-toast-390.png`, `responsive-desktop-1440.png`
- `responsive-text200-capitals-320.png`, `responsive-text200-popup-320.png`
- Before: `before-popup-1-568-320-top.png`, `before-popup-1-667-375-gold.png`,
  `before-text200-list.png`, `before-text200-popup.png`,
  `before-focus-long-popup.png`, `before-attribution-768.png`.

Real iOS/Android software keyboards, browser chrome, touch physics and physical
safe areas were unavailable. Viewport shrinking/root-font enlargement are
emulations, not native keyboard or browser-zoom certification. No actual mobile
screen reader was available; keyboard/DOM/ARIA checks do not establish VoiceOver,
TalkBack or WCAG conformance. Mapbox may retain its attribution `aria-expanded`
value when a resize collapses its content; tests inspect the rendered content
and open it before checking links. No third-party behavior rewrite was added.
PostgreSQL integration remains distinct from mocked browser coverage.
