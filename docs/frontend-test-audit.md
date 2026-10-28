# Frontend unit-test audit — Issue #73

Baseline: `16b629777827b316513cc0f5c69f193062a2915f`, Node 24.22.1 / npm 11.19.1.
Read-only inventory completed before test edits using the project-installed
`test-audit` authoring gate and `references/audit.md`. The assignment PDF,
`AGENTS.md`, `docs/testing.md`, all frontend unit files, their production owners
and callers (`App`, `Map`, `CapitalActions`), CI routing and relevant history were read.
History includes cold-start #72, flags/facts #42–43, picker #44/#55, reset #25/#57
and sidebar #59: their lifecycle, security and accessibility contracts remain.

## Boundary decisions

- API units own request paths/methods/bodies, response validation and safe errors.
  Backend injection/DB suites validate server constraints, not this client decoder.
- Store units own concurrent requests, transitions, confirmed mutations, selection
  and storage side effects. Browser mocks do not replace these failure paths.
- Marker-controller units own event cleanup, safe text, updates, navigation guards,
  colors and focus decisions. The DOM double does not prove native layout or keys.
- Existing `sidebar`, `map-selection`, `reset`, `coordinate-picker`, `flags`,
  `mobile-navigation` and `map-navigation` browser suites own actual layout, native
  keyboard/modal behavior and Mapbox integration. They are outside `npm test`.
  No browser/backend tests or product code are changed in this issue.

## Declaration ledger

Locations below refer to the baseline. Keep means a meaningful regression guard;
Improve preserves the contract while simplifying assertions; Consolidate names
the keeper. No test is deleted solely for its count, size or slow runtime.

### api-url.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `6` API base URL preserves relative development paths and all deployed endpoint paths | Keep | api-url: relative/deployed path joining is independent of browser/backend transport. |
| `15` explicit write/reset rate-limit responses explain how to recover without automatic retry | Keep | api-url: both shared CRUD and separate reset error paths must recover from 429 without retries. |

### capitals.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `13` API requests the plain capital array with native fetch | Keep | api.test: catches wrong endpoint, headers or cold-start timeout budget; explicit transport contract. |
| `22` API accepts an empty array | Keep | api.test: an intentionally empty database remains valid, unlike reset (nonempty required). |
| `27` API reports HTTP errors without displaying server internals | Keep | api.test: catches exposing private server response bodies to the UI. |
| `32` API reports network failures | Keep | api.test: connection rejection must become a recoverable client error. |
| `37` API times out while reading a response body with a safe message | Keep | api.test: timeout while reading JSON is distinct from initial-fetch timeout/retry. |
| `49` store releases a timed-out request and retry uses a fresh signal | Keep | loading.test: failed cold start must release pending state and allow a fresh, un-aborted retry. |
| `78` API rejects malformed JSON and incompatible response shapes | Keep | api.test: rejects malformed JSON, wrapper objects and invalid required fields; independent client boundary. |
| `87` store shares a pending request and exposes loading then real data | Keep | loading.test: catches duplicate reads across consumers and missing loading/data transitions. |
| `103` store exposes failures, clears the error on retry and replaces data on reload | Keep | loading.test: catches sticky error/loading state and stale records after empty reload. |
| `126` list renders country and capital names using semantic list items | Improve | Keep semantic list/name/count/action contracts, drop wrapper/class/attribute-order coupling. |
| `135` skip link is available before the long list, including loading and error states | Keep | list.test: protects map escape before long results in all load states; browser owns actual focus transfer. |
| `143` list marks results busy and hides stale data while the app announces loading | Improve | Keep busy region and stale-record suppression; drop CSS/text formatting assertions. |
| `151` list explains an empty result | Consolidate | list.test: merged empty/error rendering case retains the status; avoids repeating wrapper setup. |
| `155` list announces errors and renders an accessible retry button | Consolidate | list.test: merged empty/error case retains alert, retry button and stale-record suppression. |
| `161` search matches trimmed, case-insensitive country or capital without changing canonical data | Keep | list.test: protects trimming/case folding, country or capital matches and data immutability. |
| `171` collapsed sidebar uses native hidden while retaining the search and CRUD surface | Improve | Keep hidden pane and labeled search; remove repeated row-action assertion already in semantic row keeper. |

### continents.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `17` search and continent matrix derives independent sidebar and map results without mutating data | Keep | continents: protects combined search/filter derivation, unknown countries and cross-continent records. |
| `31` API treats malformed or missing metadata as unknown on list, create, edit and reset | Consolidate | api-metadata: malformed continents on GET; normalized metadata through each response endpoint once. |
| `52` continent selection retains canonical data and clears only an excluded selection | Keep | continents: catches losing canonical data or selecting a record excluded by the filter. |
| `68` known and unknown creates, country edits, deletion, reload and reset reconcile an active filter | Keep | continents: catches selection/filter drift across mutations, reload and reset; not a replay of generic CRUD. |
| `95` labeled combobox defaults to all continents with honest total and matching counts | Improve | Keep label, default and counts; remove styling/icon and duplicate reset-button markup. |

### coordinate-picker.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `8` picked coordinates retain lat/lng order, six decimals, signs, zero and boundaries | Keep | coordinate-picker: protects six-decimal lat/lng formatting and bounds; generic form validation remains in mutations. |
| `25` canvas clicks choose once; controls and invalid points do not; cleanup restores cursor and listener | Keep | coordinate-picker: catches controls choosing coordinates, duplicate clicks and cleanup after callback rather than before. |
| `65` cleanup is idempotent and preserves a newer tool or picking session's cursor | Keep | coordinate-picker: catches late cleanup overwriting a newer session/tool cursor (#55). |
| `80` map picking is a secondary non-submit action with an explained manual fallback | Improve | Keep non-submit, disabled and described fallback semantics; no CSS class or SSR callback proof. |
| `90` add and edit share compact, labeled fields with coordinate ranges and a close action | Consolidate | mutations form keeper retains labels, required fields, both coordinate ranges and exact stored edit values; coordinate-picker.browser owns visual layout. |

### country-facts.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `9` country populations format consistently without rounding and missing facts use neutral text | Keep | country-facts: catches rounding, unsafe integer/type acceptance and missing neutral placeholders. |
| `22` all continents/currencies are retained as text; long names, invalid entries and duplicates are safe | Keep | country-facts: protects sorting/deduplication, contradictory names and control/markup rejection. |
| `37` list/create/update/reset normalize optional facts without changing required fields or mutation inputs | Improve | api-metadata: replace subject-derived expectations and repeated field inventories with literals; required-coordinate rejection remains in api. |

### flags.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `11` only validated alpha-2 codes produce official CDN URLs and fixed decorative images | Keep | flags: protects alpha-2 URL allowlist and decorative image/fallback semantics; no arbitrary URL injection. |
| `28` flag visibility keeps the globe during loading/errors and reveals completed cached images | Keep | flags: catches cached/broken-image visibility mistakes; native DOM wiring remains separately covered. |
| `46` optional response metadata is normalized safely without rejecting otherwise valid capitals | Consolidate | api-metadata: literal flag normalization table; URL/security cases remain in flags. |
| `53` successful creates and country edits update shared flag metadata and send only the four input fields | Consolidate | mutations: enriched server records survive create/edit in the store; api-metadata tests endpoint normalization. |

### map-navigation.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `6` unavailable map controls expose native disabled buttons and accessible names | Keep | map-navigation: catches enabled unnamed controls without a map, independently of real Mapbox zoom behavior. |
| `16` picking hides the entire control group and disables all buttons | Keep | map-navigation: catches visible/active camera controls while picking owns input. |

### marker-color-storage.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `23` palette overrides persist independently; Teal and removal keep other colors and foreign keys | Keep | storage: catches one-ID writes/removals erasing another color or foreign storage keys. |
| `40` malformed, obsolete and unsafe data are ignored; IDs must be canonical database integers | Keep | storage: catches unsafe colors/IDs, malformed data and noncanonical integer keys. |
| `60` missing storage, denied getter and read/write/remove failures never escape | Keep | storage: catches denied getters/operations escaping, or failed reads overwriting unknown saved colors. |
| `80` confirmed create/delete clear their ID; edits and failed deletes preserve all colors | Keep | storage/store boundary: confirmed operations clear only their ID; edits/failures must preserve colors. |
| `101` reset clears only app colors after validated success, preserving colors on uncertain results | Keep | storage/store boundary: uncertain reset must preserve overrides; confirmed reset clears only the app key. |
| `124` storage failures cannot reject confirmed CRUD/reset results | Keep | storage/store boundary: browser persistence failure cannot reject a confirmed server mutation. |

### markers.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `11` pick mode closes popups without clearing selection and suppresses marker/list activation and flights | Keep | markers: catches unintended activation/camera writes while picking, and inability to resume selection. |
| `131` popup actions delegate current records without selection or camera writes and clean up on every closure | Keep | markers: catches stale-record delegation and detached action listeners on close/switch/delete/unmount. |
| `167` country edits update the open definition list and clear stale facts without replacing marker/popup, color or selection | Improve | Absorb text/dialog-context/identity assertions; query semantic elements instead of child indexes. |
| `193` longer popup edits stay within the available height without a camera or selection change | Keep | markers: guards the #59 height regression after longer text; identity and no-camera effects are intentional UX contracts. |
| `211` every valid capital gets a square marker at [longitude, latitude], including nearby capitals | Improve | Keep coordinate order, invalid-location filtering and nearby markers; drop CSS source scan. sidebar/map-selection.browser measure actual 32x32 square markers. |
| `225` activation opens a labeled popup with safe text and an accessible current-color control | Improve | Use semantic DOM queries rather than child indexes; retain safe text, names, role, focus and current color. |
| `241` color changes are isolated and survive popup reopen and data rerenders/reloads | Keep | Independent in-memory reopen behavior even without storage; persisted-controller keeper owns reload across instances. |
| `256` data updates reuse markers and refresh open popup text and coordinates | Consolidate | country-edits keeper owns text/dialog context and identity; selected-coordinate keeper owns marker/popup positions. |
| `270` opening another marker closes the previous popup; Escape restores marker focus | Keep | markers: catches multiple active popups, lost Escape handling and missing focus return. |
| `284` removing an active capital moves popup focus to the canvas without focusing the removed marker | Keep | markers: catches focusing a removed marker, stale listeners and loss of default color after re-adding an ID. |
| `307` removing a popup whose focus already moved elsewhere does not steal focus | Keep | markers: external focus must survive removal; covers body, canvas, other-marker and other-control targets. |
| `326` normal popup closure respects focus elsewhere and unmount does not focus the outgoing canvas | Keep | markers: catches focus theft on close and outgoing-canvas focus on unmount. |
| `343` removed capitals release markers, popups, listeners and colors; new capitals get default colors | Consolidate | active-removal keeper also checks detached listeners and default color after re-adding the ID. |
| `363` destroy releases every marker and active popup and tolerates repeated cleanup | Keep | markers: catches leaked markers/listeners and non-idempotent cleanup, distinct from deleting one record. |
| `376` list selection navigates to the matching capital, reuses its popup and interrupts an earlier flight | Keep | markers: catches wrong destination, repeated popup creation, uninterrupted flights and store feedback loops. |
| `396` marker selection and closure notify the shared selection, without a stale clear when switching | Keep | markers: catches stale null selection when switching open popups. |
| `409` only a selected coordinate edit navigates; text/reloads preserve camera, popup, marker and color | Improve | Absorb marker/popup coordinate positions; semantic coordinate name rather than child index. |
| `425` camera accommodates measured popup/map height and disables animation for reduced motion | Keep | Independent measured-height and reduced-motion calculation; browser suite proves real projection/focus integration. |
| `437` popup flags use validated metadata, fall back on image failure and update without losing color or focus | Improve | Keep native-DOM flag lifecycle separate from React; semantic image queries. Cached-image wiring remains a distinct regression. |
| `477` popup flags reveal already cached images even without a later load event | Improve | Keep native-DOM flag lifecycle separate from React; semantic image queries. Cached-image wiring remains a distinct regression. |
| `491` reset closes selection and restores every marker to Teal without camera movement | Keep | markers: reset must close active popup and clear live colors without moving the camera. |
| `507` continent visibility retains instances and colors, blocks hidden activation and clears popup without hidden focus or flights | Keep | markers: filtering must retain instances/colors while preventing hidden activation and hidden focus. |
| `538` filtered CRUD and reset reconcile visibility while only actual deletion releases markers | Keep | markers: catches stale visibility after country changes and incorrect cleanup after actual deletion/reset. |
| `563` persisted colors restore on new controllers with selected swatches and stable markers across edit/filter/read | Keep | markers + storage fixture: verifies persistence wiring across controller recreation, not just Storage helper behavior. |
| `602` failed storage writes leave immediate marker color, swatch, popup reopen and filter behavior usable | Keep | markers: catches a storage exception breaking live swatches, reopen or filter behavior. |
| `620` zero-sized hidden maps never calculate a flight; showing the same selection reuses marker and popup | Keep | markers: catches flights with zero dimensions and unnecessary recreation when showing an existing selection. |

### mobile-navigation.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `6` mobile tabs announce exactly one active destination with matching panel relationships | Keep | mobile-navigation: protects roving-tab and panel relationships without a token/browser. |
| `20` automatic tab activation wraps arrows and supports Home/End; native activation keys pass through | Keep | mobile-navigation: cheap key-to-destination contract; browser separately verifies native focus/activation. |
| `29` coordinate picking temporarily disables both view controls | Keep | mobile-navigation: prevents view changes while the coordinate picker owns input. |

### mutations.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `14` POST/PUT send complete numeric JSON without body id; DELETE accepts empty 204 | Keep | mutations: guards JSON method/path/body and DELETE 204; now explicitly asserts methods and strips a passed id. |
| `31` mutations explain 400/404/409 and hide unexpected backend details | Improve | Each HTTP message once through shared mutation transport; endpoint methods tested separately. Store failure keeper still exercises create/edit/delete. |
| `41` network/timeout and malformed successful responses warn about uncertain writes | Keep | mutations: catches unsafe retries after uncertain writes, malformed JSON and mismatched update IDs. |
| `56` validation requires every field, trims names and emits numeric coordinates | Keep | mutations: protects required fields, trim/numeric conversion and NUL rejection. |
| `64` coordinate validation rejects nonfinite/nonnumeric/out-of-range values and accepts boundaries/zero | Keep | mutations: protects finite numeric ranges, zero and both coordinate boundaries. |
| `75` successful store mutations synchronize canonical records for all subscribers without extra GETs | Improve | mutations: enriched server metadata must survive create/edit and notify all subscribers, without a follow-up GET. |
| `97` failed mutations preserve shared data, reject to the form and release pending state | Keep | mutations: all three store mutation wrappers must reject, preserve data and release pending state. |
| `107` pending mutations block duplicate writes/reloads and loading blocks mutations | Keep | mutations: catches duplicate writes, overlapping reloads and writes while loading. |
| `124` create/edit reuse labeled required fields; displaying forms/confirmation performs no write | Improve | Absorb form semantics from coordinate-picker; remove vacuous SSR no-write claim. sidebar.browser owns actual cancel/no writes. |

### reset.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `14` reset POST sends only explicit confirmation and reads validated capitals | Keep | reset: protects explicit confirmation, route/body and short write timeout. |
| `28` successful reset atomically replaces data, clears selection and signals color reset | Keep | reset: catches subscribers seeing mixed replacement data, selection or reset-version state. |
| `41` pending reset prevents double submit, CRUD and overlapping reads | Keep | reset: guards duplicate/reset/CRUD/read races; reset has its own store path. |
| `57` HTTP/network/invalid response failures preserve data, selection and colors with no retry | Keep | reset: catches uncertain results changing records/selection/version or triggering automatic reset retries; colors owned by storage suite. |
| `78` sidebar replaces refresh with adjacent reset; opening confirmation performs no write | Consolidate | reset warning keeper retains accessible description, destructive/shared warning and safe default; reset.browser owns adjacency/cancel/no writes. |
| `92` reset dialog presents exactly three consequences, shared-data warning and accessible header | Improve | One semantic warning test; drop icon counts, CSS classes, exact sentence inventory and forbidden vocabulary. reset.browser retains consequences/focus/cancel. |

### selection.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `12` selection accepts existing capitals from list or map and repeated selection is an explicit new request | Keep | selection.test: catches accepting stale IDs and losing repeated activation/source signals consumed by Map. |
| `29` confirmed edits retain selection; failed deletes retain it; confirmed deletion and empty reload clear it | Keep | selection.test: catches stale selection after confirmed delete/reload versus preserving it after edit/failure. |
| `48` rows use native selection buttons, with actions outside their activation targets | Improve | Drop misleading store setup: SSR reads initial state, so this proves unselected native semantics and separate actions in list keeper. map-selection.browser owns actual selected state. |

### sidebar-polish.test.tsx

| Original case | Decision | Evidence / remaining owner |
| --- | --- | --- |
| `5` map reveal centers variable-height rows and clamps at both list boundaries | Consolidate | One geometry table also includes the non-scrollable/tall-row case. |
| `17` reveal leaves a non-scrollable list at its start even for a tall row | Consolidate | Merged into map reveal geometry table; same clamping contract, no separate setup. |

## Validation

Before: `npm ci`, `npm run check`, `npm test` pass. Frontend: 92 unit tests
and 2 Vite branding integration tests pass. Backend: 58 pass, 3 PostgreSQL suites
skip because `TEST_DATABASE_URL` is unset. Initial restricted attempts could not
resolve npm / open tsx IPC; successful baseline checks ran outside those restrictions.
The existing Vite/esbuild advisories and large-bundle warning are unchanged.

After: `npm run check`, `npm run test:unit -w frontend`, `npm test` and
`git diff --check` pass. Frontend: 83 unit tests and 2 branding tests pass.
Backend remains 58 pass / 3 skipped PostgreSQL suites. No test database was selected
and no database was modified. Existing development advisories: Vite (high),
esbuild (moderate); no dependency changes. Browser suites were inspected, not run
in this unit-only refactor. Their native layout/key/Mapbox proof remains separate
from the passing unit/HTTP checks.

| Structure | Before | After |
| --- | --- | --- |
| Frontend unit files / declarations | 14 / 92 | 17 / 83 |
| Frontend unit test lines | 1,690 | 1,566 |
| Shared support lines | 0 (doubles inline) | 19 (Storage fixture) |
| Product lines changed | — | 0 |

The extra files separate mixed owners; count reduction is incidental. The existing
DOM/Mapbox double remains local to `markers.test.tsx`: it models only controller
needs, including Mapbox's `role="img"` assignment and focus-after-detach ordering.
Tiny tag/name lookup helpers replace popup child indexes without a selector engine.
Store cleanup uses Zustand's existing initial state instead of partial hand-built
snapshots. No test-only production hook was removed or added.

## Preservation experiments

Six deliberate mutations were applied **only in a temporary copy**; each failed
an intended assertion in the retained owner. Restoring the copied sources made
all three affected suites pass again. No mutation runner or new harness is added.

| Deliberate failure | Retained test detecting it |
| --- | --- |
| Bypass GET metadata normalization | api-metadata: literal normalization table / endpoint decoder |
| Serialize metadata/id into a write body | api-metadata: four input fields |
| Leave popup coordinates stale after editing | markers: selected-coordinate edit |
| Put capital names into HTML instead of text | markers: safe popup activation |
| Leave detached swatch click listeners attached | markers: active-capital removal |
| Drop server metadata when storing confirmed CRUD | mutations: canonical subscriber updates |

Preservation review also corrected two misleading assertions: SSR never proves a
selected Zustand row (initial snapshot only), and SSR callback counters do not
prove user cancel behavior. Real selection/cancel remains in existing browser
suites; the cheap units now state their actual semantic scope. The consolidated metadata request assertions
sit outside the Fetch double so production error handling cannot swallow them.

Deferred: browser consolidation (#74), backend refactoring (#75), existing Vite
upgrade/bundle-size work. No new user-facing behavior or deployment changes.
