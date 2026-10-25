# Animation opportunities audit — Issue #33, Phase 1

**Status: Phase 1 complete – awaiting user approval for implementation.**

Audit date: 25 October 2026 (Europe/Berlin). Application baseline:
[`5f555ca38b088a3cef241a5138ae6b04c75d051a`](https://github.com/JonasGreim/Map-Capital-Cities/commit/5f555ca38b088a3cef241a5138ae6b04c75d051a),
including merged PR #44. Branch: `chore/33-animation-opportunities-audit`.
Only skill installation, license/provenance and this report belong to this change.
No application code, dependencies, layout or animation was changed.

## A. Executive summary

The application is deliberately restrained, rather than lifeless. Its globe already
has a small hover/focus scale; Mapbox supplies camera travel, drag/zoom feedback and
marker positioning. Selection, buttons, form validation and pending/error feedback
are already legible without movement. Adding motion to most of these seams would
slow a functional map/list interface or compete with the camera.

**One candidate survives the skill's gate: a 160 ms opacity-only entrance for a
new asynchronous success toast.** Keep its dismissal immediate. Do not add a slide,
exit lifecycle or a new animation library. This is a proposal for later selection,
not an implemented change. There is no well-supported second or third motion task.

The browser audit rendered real Mapbox at all three requested sizes with 220
controlled records. It confirmed 32 × 32 px regular markers, immediate keyboard
focus and native dialog behavior, plus 900 ms/0 ms camera duration under normal/
reduced motion. Mobile is still the current stacked list/map; it is not Variant B.
At 320 px, focusing a popup swatch scrolls the popup's title out of its internal
viewport. That is evidence for #38/#39's visibility checks, not a reason to animate.

## B. Prioritized opportunities — skill Part 1

Frequency estimates below are workflow judgments, not product analytics. A search/
map tool merits the conservative tier when frequency is uncertain. The full gate
is applied in order: **Frequency → Purpose → Speed → Function**. Keyboard-driven
navigation, focus jumps and overlay opening stay immediate under the upstream
skill's explicit keyboard disqualifier. An asynchronous server-confirmed notice
is evaluated as feedback; it does not gate the initiating keyboard action.

| Priority / location | Today | Purpose | Frequency | Suggested motion | Effort |
| --- | --- | --- | --- | --- | --- |
| P1 — `CapitalActions.tsx:97,107`; `styles.css:79` | A persistent, polite status node receives text immediately and clears after 4 s; no transition | **Feedback**, **Preventing a jarring change** | Occasional, after a confirmed create/edit/delete/reset | New notice: `opacity: 0 → 1`, **160 ms**, `cubic-bezier(0.23, 1, 0.32, 1)`, no delay. Dismissal and replacement text remain immediate (**0 ms**). Reduced motion: opacity only, **80 ms**, same curve; no translation/scale | Small–medium; CSS plus careful entry triggering and replacement verification |

Source: [CapitalActions](../frontend/src/CapitalActions.tsx),
[toast CSS](../frontend/src/styles.css). Line numbers throughout refer to the
baseline commit above, not the upstream skill repository.

### P1 recipe and all four gate answers

- **Frequency:** occasional asynchronous confirmations, unlike reading/searching
  and selecting capitals. Do not replay a fresh entrance for every same-slot text
  replacement during rapid operations. No queue or sequence of bouncing notices.
- **Purpose:** confirm a successful write and soften the abrupt arrival of a
  floating status surface. A slide from above adds no necessary spatial information.
- **Speed:** 160 ms on entry is below the skill's general 300 ms UI ceiling;
  80 ms opacity under reduced motion is a gentler non-spatial alternative. No wait
  before committing data, closing a dialog, restoring focus or updating the status.
- **Function:** the notice becomes easier to notice without moving the map, list
  or controls. The benefit is modest, so it is reasonable to select nothing.
- **Properties/states:** animate only opacity on the notice's visual surface.
  Keep the live-region paragraph mounted; insert one unkeyed visual child only
  while notice text is nonempty, with the toast box styles on that child. Its
  insertion uses `@starting-style` if supported; settled opacity is 1. The current
  persistent text node changing alone would not trigger `@starting-style`, so a
  CSS-only rule on that unchanged node is insufficient. Unmount the visual child
  immediately when empty. Replace text in the same child while visible (opacity 1);
  do not key it by message. Unsupported entry transitions fall back to immediate
  appearance. No permanent `will-change`.
- **Easing:** the exact upstream `--ease-out` curve above; the app has no shared
  motion tokens today. If implemented, give this curve one shared token rather
  than introducing a library or changing the existing globe's `ease-out` behavior.
- **Accessibility:** keep the existing status element mounted with `role="status"`,
  `aria-live="polite"`, `aria-atomic="true"`. Update text immediately from the
  confirmed response; never wait for `transitionend`, toggle `aria-hidden`, move
  focus or remount the live region to replay motion. It stays noninteractive and
  `pointer-events: none`. Verify speech with a real screenreader before shipping;
  DOM semantics alone do not prove announcement timing or identical-message speech.
- **Rapid events:** retain one slot and the existing four-second dismissal timer.
  A new nonempty value cancels the preceding timer in the current effect. Opening
  an action currently clears the notice. Setting the same nonempty string without
  an intervening clear does not restart React's timer; do not claim animation fixes
  this existing behavior or add an unrelated message system. Clear → new notice
  may enter again; new text while visible must not flicker or wait behind a fade.
- **Why no exit:** `:not(:empty)` currently owns the toast box. Retaining disappearing
  text or adding presence state merely for a fade increases lifecycle and live-region
  complexity without meaningful benefit. A delayed fade-out is rejected at Function.
- **Performance/layout:** one small fixed surface; opacity does not change layout.
  Border, shadow, padding, position and dimensions are not interpolated. No JS
  animation loop, map remount or GPU layer per marker. No measured frame-time claim
  is made: headless software WebGL is not a mobile performance benchmark.
- **Conflicts/dependencies:** independent of #38/#39's navigation implementation,
  but its final mobile placement and possible overlap must be rechecked there.
  Preserve #26's confirmed-success timing and #29's picker/dialog ownership. No
  regular marker or Mapbox camera change is part of this recipe.
- **Future acceptance:** confirm immediate status text/focus, rapid distinct and
  identical outcomes, reduced motion, unmount cleanup and fallback browsers. The
  proposed visual behavior has not been implemented or timed in this audit.

## C. Do Not Animate — skill Part 2

Five deliberately rejected groups cover the other candidate seams. “Fail” names
where the ordered gate stops; later columns explain additional constraints.

| Candidate / evidence | Frequency | Purpose | Speed | Function / verdict |
| --- | --- | --- | --- | --- |
| Extra camera choreography or popup entrance/exit — `capital-markers.ts:98,180,227,263` | Frequent map/list navigation; keyboard-capable: **fail Frequency** for extra UI motion | Camera already provides spatial consistency; popup color controls already receive focus | Existing flight is 900 ms or 0 ms reduced, outside the budget for a new UI transition; do not stack another duration | **Reject.** Keep Mapbox in charge; do not transform its marker/popup positioning wrapper, defer controls or delay Escape. No second pan/fly sequence |
| Marker hover bounce, color tween, bulk marker/list entrances — `styles.css:116`; `capital-markers.ts:143,287`; `CapitalList.tsx:127` | Hundreds of persistent objects; repeated hover/selection: **fail Frequency** for added motion | Static outline, `aria-pressed`, swatch checkmark and exact color already indicate state | Even short stagger delays compound across 200+ capitals | **Reject.** No pulses, position/size interpolation, animated shadows, marker-wide fades or 30–80 ms-per-row staggers. Keep immediate color changes and 32 × 32 px squares |
| List selection/reveal, search/clear, continent/no-results, sidebar and future Map/Capitals navigation — `CapitalList.tsx:25,46,86,96,122`; `App.tsx:24` | Core navigation, keystrokes and repeated filters; potentially 100+/day: **fail Frequency** | Selection/count/empty text already indicate state; reveal locates the selected row | Even 100–200 ms repeated per action is friction; no debounce added for motion | **Reject.** No smooth row scrolling, highlight pulse, fading search results, delayed filter removals, grid-column/height interpolation or sliding tab panes. Hidden controls must leave focus order immediately |
| Menus, Add/Edit/Delete/Reset dialogs, picker handoff, validation/pending/errors — `CapitalActionsMenu.tsx:17,31,44`; `CapitalDialog.tsx:29,43`; `CapitalForm.tsx:39,48,60,80,96`; `Map.tsx:96,139` | Some are occasional, but keyboard opening, focus and Escape are first-class: **fail Frequency** for shared entry/exit animation | Their purpose is access/confirmation, already served by native controls and inline status | A 125–200 ms menu or 200 ms modal could fit in isolation; that does not override the keyboard rule | **Reject.** No delayed showModal/close, backdrop fade, error shake, spinner delay, field animation, hold-to-confirm or animated modal→map→modal handoff. No modality-tracking infrastructure just to permit pointer-only decoration |
| Extra globe animation, flags, empty-state celebration and gesture effects — `styles.css:20`; `CountryFlag.tsx:5`; no custom drawer/swipe component exists | Globe hover repeats; empty/search states recur | **Fail Purpose** for perpetual rotation or decorative bounce on a data tool; current tiny scale is sufficient | Endless rotation has no bounded budget; longer celebration fails Speed | **Reject.** No auto-rotation, duplicate hover, flag crossfade, pointer tracking, springs, confetti or new draggable bottom sheet. Fixed flag placeholders already prevent layout jumps |

The globe's existing keyboard scale and Mapbox's existing keyboard-triggered flight
are inventoried below, not newly recommended by this opportunity finder. Changing
existing behavior requires a separate decision; the skill is not an existing-motion
repair task and no other upstream skill was installed to expand the scope.

## D. Existing motion and immediate feedback

| Surface / file:line | Actual current behavior | Recommendation |
| --- | --- | --- |
| Brand — `styles.css:20–25`, `App.tsx:15` | `transform 200ms ease-out`, scale 1 → 1.06 on hover/focus-visible. Reduced motion removes transform and transition. A separate 3 px outline marks keyboard focus | Keep unchanged; no second logo effect. Hover is not currently fine-pointer gated; touch-device sticky hover is a #39 validation item, not grounds for this PR to change it |
| Camera — `capital-markers.ts:32–36,98–103` | `map.stop()` interrupts travel; `flyTo` uses 900 ms, reduced motion 0 ms. Popup-fit/coordinate edits may use this same path. Browser recorded 900 → 0; 390 px needed additional normal-motion fit flights | Keep current owner and reduced-motion behavior. Additional fit flights are existing behavior, not an invitation for a new transition |
| Selected-row reveal — `CapitalList.tsx:25–31,46–53` | Direct, clamped `scrollTop` in the list only, no smooth-scroll duration | Keep immediate; do not scroll the page or change query/filter/focus for marker reveal |
| Mobile list selection — `Map.tsx:88–94` | `scrollIntoView({block:"nearest", behavior:"instant"})` reveals the current stacked map | Keep during Phase 1. #38 replaces the navigation model; don't layer smooth whole-page scrolling onto it |
| Mapbox stylesheet — imported in `main.tsx:1` | Library `.mapboxgl-marker` defines `transition: opacity .2s`; geographic transforms/projection are library-managed. Library also ships user-location pulse and gesture-warning transitions | Do not claim these are new application animations. No geolocation control/pulse is instantiated by `Map.tsx`; bundled CSS alone is not evidence of an active pulse. Don't add marker animations on top |
| Buttons, rows, swatches, errors, toast, dialogs, menus — `styles.css:44–101,129–160` | Background, outline, pressed/checkmark and disabled feedback switch immediately. The only application CSS transition found is the brand transform | Existing feedback is sufficient; generic press scaling is not needed. Toast entry is the one optional proposal |

There is no animation library, shared easing/duration token set, accordion, route
transition or custom swipe/drag surface in the application. All hunt classes were
checked: feedback gaps (existing active styles), teleporting state (toast candidate;
filters/dialogs rejected), spatial story (Mapbox owns camera), group entrances
(rejected), gesture seams (none beyond Mapbox), and delight budget (unneeded here).

## E. Dependencies and mobile boundary

- **Eligible for a later approved change now:** P1 toast entrance only. Its desktop
  usefulness does not depend on tabs, but mobile placement still needs final QA.
- **Dependent on [#38](https://github.com/JonasGreim/Map-Capital-Cities/issues/38)
  and [#39](https://github.com/JonasGreim/Map-Capital-Cities/issues/39):** assess
  Variant B after its real two-pane visibility/focus/resize/state contracts exist.
  Prefer immediate Map/Capitals switching, active-state indication without movement,
  retained camera/list state and resize-before-navigation. Do not preapprove a pane
  slide or fade on the basis of a mockup. A short occasional overlay transition
  could only be reconsidered with actual frequency and modality evidence; there
  is no accepted mobile animation candidate today.
- **Not pursued:** animated desktop sidebar geometry, mobile tabs/layout changes,
  animated list/marker updates, popup choreography, dialog fades and perpetual
  decoration. #38/#39 remain open and are not implemented or changed by this PR.
- The #38 comment supplies the approved Variant B mockup. Its written contract is
  sufficient for this dependency boundary; no fidelity implementation or full visual
  comparison to that mockup is claimed. Older issue text mentioning then-future
  #23/#27/#28/#29 features does not override the inspected current main.

## F. Decision — skill Part 3

The best single optional gain is the toast's **160 ms opacity entrance**. It marks
an occasional confirmed outcome without changing navigation or focus. With limited
time, implement at most that one motion change after explicit user selection; do
not invent two more just to fill a quota. Keep its current immediate dismissal and
all high-frequency controls immediate. Keeping the interface exactly as it is is
also a defensible choice given the modest gain.

Do not implement tabs, sidebar/menu/modal/popup motion, marker scaling, bulk
staggering or another camera animation. The upstream handoff would be
`improve-animations plan <selected suggestion>` or a direct implementation brief;
that other skill was neither installed nor invoked. **No handoff or Phase 2 starts
until the user explicitly selects/approves an animation.**

## G. Accessibility, responsiveness and performance evidence

### Executed browser analysis

Isolated, new Chromium contexts (no authenticated profile), headless software
WebGL, real Mapbox streets style. Browser-only `/capital` routes supplied Berlin,
Prague, Tokyo and 217 clearly synthetic fixture records; these are not real imported
country data. Every API request, including writes, was intercepted. One fixture-only
edit per viewport exercised the real success UI; no normal database mutation or
reset was sent. Application files on disk were not modified by browser tooling.
A served-response probe exposed the map and recorded existing flight durations;
it introduced no visual transitions. Screenshots and probes remain in `/tmp`,
excluded from commits per AGENTS.md.

| Viewport | Real map / regular markers | Width overflow | Current page geometry | Observations |
| --- | --- | --- | --- | --- |
| 1440 × 900 | Yes / 220 at 32 × 32 CSS px | None | Document 900 px high; map begins ~95 px | Desktop split, full list scroller and popup controls usable |
| 390 × 844 | Yes / 220 at 32 × 32 CSS px | None | Document 1059 px high; map begins ~595 px | Stacked list above map, document scrolling; not Variant B. Toast visible without movement |
| 320 × 568 | Yes / 220 at 32 × 32 CSS px | None | Document 826 px high; map begins ~506 px | Narrow map/popups require scrolling. Popup color focus can scroll its title out of internal view; invalid form scrolls inside the native dialog |

At each size the following ran successfully: search/no-results and clear-to-input
focus; Europe filter reducing list and visible markers to two; three-dot menu
keyboard opening with immediate Edit focus and Escape return; Add form's four
invalid fields and first-field focus; Add/Edit dialog access; delete/reset cancel;
Escape dismissal; fixture edit success toast; sidebar collapse/expand; empty API,
HTTP error/retry and loading states. Map selection opened the real popup, Red swatch
selection worked, and normal/reduced flight durations were recorded. Picker entry
closed the native modal, Escape resumed it with the unsaved name intact. Reset was
canceled, never confirmed. No new visual proposal was injected for comparison.

### Source-supported guarantees and limits

- **Reduced motion:** current brand computes `transform: none`, `transition: 0s`;
  camera probe records 0 ms. Proposed toast removes spatial motion entirely and
  shortens its fade. Preserve these independently; no blanket animation reset is
  proposed for Mapbox internals.
- **Keyboard/focus:** actual brand outline was 3 px with `:focus-visible` at every
  size. Menu, validation and native modal cancel flows passed. Source preserves
  `showModal`, pending dismissal blocking and queued restoration to a usable trigger
  or map fallback (`CapitalDialog.tsx:15–44`). Native modal containment and focus
  must never wait for animation. This is not exhaustive keyboard or contrast QA.
- **Announcements:** toast is persistently mounted and polite/atomic; pending
  messages use status, API failures use alert and field descriptions/invalid states
  link errors. Browser checked DOM semantics, not spoken output. Never animate
  announcements, delay an alert or remove text from the accessibility tree to fade.
- **Pointer/touch:** swatches, marker buttons and labeled native controls have
  independent click/keyboard paths; touch-capable contexts ran at narrow sizes.
  Actual touch gestures, sticky hover, virtual keyboards, OS safe areas, mobile
  Safari and hardware assistive technology were not verified. If new hover motion
  were ever approved, gate it with `(hover: hover) and (pointer: fine)` and preserve
  non-hover focus feedback. No new hover candidate survived this audit.
- **Picker:** `Map.tsx:96–135` stops any existing flight, installs one temporary
  coordinate listener, removes it on exit and places a separate 22 px preview.
  `coordinate-picker.ts:13–29` uses crosshair plus canvas-only click handling.
  Source covers click-to-return, busy/error and cleanup paths; the browser audit
  exercised entry/cancel/draft preservation, not every coordinate/error race.
- **Performance:** `Map.tsx:25–78` owns construction/cleanup and ResizeObserver;
  filtering and selection update the existing controller. No remount, layout
  interpolation, repeated geometry polling, per-marker animation loop or permanent
  compositor promotion is recommended. Current popup fitting measures geometry;
  adding animations to measured popup dimensions could introduce instability.
  CPU/GPU/frame-rate, CLS and power were not benchmarked. Fixed flag slots, fixed
  marker size and opacity-only notice proposal minimize structural layout risk;
  they are not a measured CLS result.

## H. Skill provenance, installation and actual use

### Upstream security/license review

Publisher: [Emil Kowalski's `emilkowalski/skills`](https://github.com/emilkowalski/skills).
Discovery reference: [skills.sh entry](https://www.skills.sh/emilkowalski/skills/find-animation-opportunities).
Reviewed upstream commit: **`2d228630ba1446365f614a108cb8252f1feda202`**.
Pinned [original SKILL.md](https://github.com/emilkowalski/skills/blob/2d228630ba1446365f614a108cb8252f1feda202/skills/find-animation-opportunities/SKILL.md)
and [MIT license](https://github.com/emilkowalski/skills/blob/2d228630ba1446365f614a108cb8252f1feda202/LICENSE).
There is no separate semantic skill release/version at this pin.

The original complete SKILL.md was read before installation. `git ls-tree -r`
shows exactly one `100644` Markdown file in the target skill directory: no
executables, symlinks, scripts, hooks, MCP server, dependency manifest or requested
permissions. Full-repository inventory includes other skills, README, LICENSE,
a performance cheatsheet and small Git/metadata files; none of the other skills
was installed or invoked. `.pl` was empty. Links and possible handoffs in the text
are references, not permission to install tools or change application code.

License is MIT, Copyright (c) 2026 Emil Kowalski: redistribution is permitted with
the copyright and permission notice retained. The root LICENSE is copied unchanged
alongside the unmodified SKILL.md. No additional skill-specific terms or credential
requirements were present in the reviewed source. This reviews repository licensing,
not every external site's service terms. The official source identity and commit
were checked; this is not a claim of independent cryptographic publisher attestation.

### CLI mechanism reviewed, installation actually used

`skills@latest --help` resolved to **skills CLI 1.7.4**, run with Node **24.22.1** /
npm **11.19.1**, an empty process environment except a temporary home/cache and
PATH, plus `DO_NOT_TRACK=1` / `DISABLE_TELEMETRY=1`. The downloaded package was
inspected: its Codex agent path is `.agents/skills`; global installation requires
`-g`; `--agent codex --skill find-animation-opportunities --copy --yes` targets
one local skill. The help also offers all-agent/all-skill options and telemetry
metadata; these were not used. No npm package was added to this application.

For an explicit reviewed SHA and fail-if-existing destination, the actual install
used the bundled Codex **skill-installer** helper in download mode, rather than
letting the third-party CLI install a moving branch. Its source and GitHub request
helper were inspected. It checks archive traversal, target names and skill symlinks,
copies only the selected folder and refuses an existing destination. It can
otherwise inherit GH_TOKEN/GITHUB_TOKEN, so the installation ran with an empty
environment; no token or root `.env` was supplied to it:

```bash
env -i PATH=/usr/bin:/bin HOME=/tmp/animation-cli-home \
  python3 /home/jonas/.codex/skills/.system/skill-installer/scripts/install-skill-from-github.py \
  --repo emilkowalski/skills \
  --path skills/find-animation-opportunities \
  --ref 2d228630ba1446365f614a108cb8252f1feda202 \
  --dest /home/jonas/Documents/fullstack-test-template/.agents/skills \
  --method download
```

This source-copy helper has no independent published version; the recorded upstream
pin and output hashes establish the installed payload. It temporarily downloads
an archive but only installs the requested directory. Existing Codex profiles,
MCP config and application lockfiles were not changed. Third-party CLI help did
not install skills. Public-source downloads used no credentials. Normal browser
Mapbox requests use the existing public frontend token; no token value, root env
content, authenticated session or generated browser file is committed.

Final installation contains exactly:

```text
.agents/skills/find-animation-opportunities/
  SKILL.md     # unchanged upstream
  LICENSE      # unchanged upstream root license
  NOTICE.md    # local provenance and usage only
```

`SKILL.md` SHA-256:
`d52a377819b84a71930f0c822cfe2849f40301605a2d5c7eccbfa3b257700df2`.
LICENSE SHA-256:
`4ff5bdb7887ec1435c9cab0e8d1a7caee704d894d65c2a008ccc68b1cc2f260b`.
Byte comparison with the pinned upstream passed.

### Discovery is verified beyond file existence

Using local **codex-cli 0.114.0**, a fresh `codex app-server` received initialize,
initialized and this read-only JSON-RPC request; no model turn was started:

```json
{"id":2,"method":"skills/list","params":{"cwds":["/home/jonas/Documents/fullstack-test-template"],"forceReload":true}}
```

It returned `find-animation-opportunities`, path
`/home/jonas/Documents/fullstack-test-template/.agents/skills/find-animation-opportunities/SKILL.md`,
`scope: "repo"`, `enabled: true`, and `errors: []`. All five existing project
skills were also enabled: fastify-http, impeccable, issue-work, pr-review and
web-design-guidelines. Their files match pre-install SHA-256 checksums. No profile
was altered to enable this skill. Read-only sandbox startup timed out; the same
local request succeeded outside that sandbox. The snap launcher also failed under
the restricted runtime directory, so the installed binary
`/snap/codex/current/bin/codex` was used directly.

[Official skill discovery documentation](https://learn.chatgpt.com/docs/build-skills)
describes repo-local `.agents/skills` and automatic detection; restart only if a
picker is stale. [Official app-server documentation](https://learn.chatgpt.com/docs/app-server)
documents `skills/list` and `forceReload`. The current chat loaded and applied the
installed instructions explicitly; a parent-chat restart was not needed. This
proves local CLI discovery and readable/applicable instructions, not that every
IDE picker has already refreshed its cached listing.

### Actual invocation and methodology

After installation/discovery, the primary Codex agent explicitly invoked
**`$find-animation-opportunities`**, read the complete installed file and applied
it to the code and browser evidence with this concrete user brief:

> Find purposeful animation opportunities in the current Map Capital Cities interface. Prioritize usability, clarity, spatial consistency, responsiveness, accessibility and performance. Explicitly identify interactions that should not animate. This is a read-only audit. Do not modify application code. Provide a prioritized report with precise recommendations.

The resulting audit is Sections A–G, not a readiness response. It uses the
original Recon → Sweep → Gate → Report method, exact recipe values, one surviving
opportunity, five rejected candidate groups and a verdict. `$web-design-guidelines`
and its local checklist supplied the complementary accessibility review; the
upstream skill did not replace that review. `$issue-work` supplies the GitHub flow.
The skill's handoff links did not cause any additional skill installation.

## I. Validation and limitations

- Read complete live #33/#38/#39 and comments, AGENTS.md, relevant README sections,
  the readable local assignment PDF and current frontend. PDF confirms the regular
  square 32 × 32 px marker contract. No new domain requirement was invented.
- Initial working tree was clean. Git fetch was attempted but HTTPS credentials
  are unavailable here. Connected GitHub API `branches/main` confirmed remote
  **5f555ca38b088a3cef241a5138ae6b04c75d051a**, identical to local `origin/main`.
  No open PR was returned by the repository search at preparation time. Work
  branched from that verified baseline; PR #44 is already included.
- Node **24.22.1**, npm **11.19.1** explicitly selected. `npm ci` completed from
  the existing lockfile. An interrupted network-restricted install initially left
  incomplete node_modules; a completed offline cache restore repaired it before
  final checks. No package manifest or lockfile changed. The online install reported
  two existing dev-tool advisories (moderate/high); an offline zero-advisory summary
  is not evidence that these were resolved. No audit fix or dependency upgrade ran.
- **`npm run check`: passed** (lint, both workspace typechecks and build). Vite
  reports the existing >500 kB chunk warning; no new library is introduced here.
- **`npm test`: passed — 125 passed, 2 skipped** across backend (43 pass/2 skip),
  frontend unit (80 pass) and branding HTTP/build/preview (2 pass). The two skipped
  suites need a disposable `TEST_DATABASE_URL`. No real PostgreSQL integration or
  live REST Countries import is claimed; neither was needed or run for this audit.
- Isolated browser analysis passed at all three requested viewports as detailed
  above; real Mapbox rendered, capital API was mocked. Screenshots were visually
  inspected. This is an audit of existing behavior, not before/after proof of an
  unimplemented recommendation, full CRUD regression or real-device benchmark.
- `git diff --check` passed. Complete intended diff and file allowlist reviewed
  before publication. Existing skill checksums and `package.json`, `package-lock.json`,
  `.codex/config.toml` checksums match. The only four added files are the three
  installation files above and this report. No source, generated build/screenshot,
  browser session, env, assignment PDF or secret is part of the change.

**Phase 1 stops here. Issue #33 must remain open for the user's selection; the PR
references it without an automatic closing keyword and must remain unmerged.**
