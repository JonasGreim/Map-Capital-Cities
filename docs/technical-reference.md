# Technical reference

[Project overview](../README.md) · [Development](development.md) · [Testing](testing.md)

## Architecture

React + Vite uses Zustand for shared state and native fetch for the same-origin
Fastify REST API. Fastify uses a pg pool and parameterized SQL against PostgreSQL.
Mapbox renders the browser map; REST Countries v5 is imported server-side at startup.
Country metadata stays in backend memory; marker colors stay in browser storage.

The assignment's core is first-run SQL initialization, startup import, five CRUD
routes, the capital/country list and square 32 × 32px markers with color popups.
Implemented additions include UI CRUD, search, continent filters, country facts,
persistent colors, coordinate picking, explicit reset and mobile navigation.

- [Data](#data) and [startup import](#backend)
- [Capital API](#capital-api)
- [Frontend behavior](#frontend), [CRUD](#create-edit-and-delete-capitals) and [reset](#reset-to-default)

## Data

```json
{ "id": 1, "name": "string", "latitude": 0.0, "longitude": 0.0, "country": "string", "flagCode": null, "continents": null, "population": null, "currencies": null }
```

`db/schema.sql` creates `capitals` with an automatically generated integer ID,
non-null/nonblank names and countries, latitude in [-90, 90] and longitude in
[-180, 180]. Capital names are unique case-insensitively (`lower(name)` index);
countries have an exact unique constraint.

## Backend

On startup, import countries and capitals from [REST Countries](https://restcountries.com/docs) v5
(`country` = common name, `name` = capital):

```
GET https://api.restcountries.com/countries/v5
Authorization: Bearer <RESTCOUNTRIES_API_KEY>
```

`backend/src/import-capitals.ts` is independent of the server bootstrap. Startup
first checks PostgreSQL readiness (up to 30 attempts for known transient failures,
1 second between failures; connections time out after 2 seconds and queries after
5 seconds), then imports,
then listens on port 3001. A missing key, unavailable DB, failed import or missing
schema aborts startup with a visible error and nonzero exit status. The root
`.env` is loaded before creating the pool; the API key remains server-side.
Authentication errors, a missing database, an unknown host and unrecognized
configuration errors fail on the first attempt. Readiness errors provide fixed,
sanitized hints without printing the connection URI or raw database error.
The retry budget is finite, not a fixed 30-second deadline: connection/query
duration adds to the 29 one-second gaps. A refused local connection normally
exhausts the budget in about 29 seconds.

The importer requests `limit=100` and advances `offset` by the returned count.
It maps `data.objects`: `names.common` → country, `capitals[0].name` → name and
`capitals[0].coordinates.lat/lng` → coordinates. Text is trimmed; missing/blank
names, missing first capitals, nonnumeric/nonfinite or out-of-range coordinates
are skipped. Additional capitals are ignored as required by the assignment.

Pagination follows and validates `data.meta.total/count/limit/offset/more` from
the [v5 documentation](https://restcountries.com/docs/countries#pagination).
Without metadata it continues full pages until a short/empty page. Contradictory
metadata, stalled/repeated pages, changing totals, demo responses, invalid JSON
or envelopes, HTTP errors and network failures fail the import. Each request has
a 15-second timeout; a 100-page safety cap prevents an endless import. Failed
requests are not automatically retried; fix the error and restart the backend.

All pages are fetched and validated before opening a transaction. Parameterized
inserts use `ON CONFLICT DO NOTHING`; one transaction commits all valid records
or rolls back on a database error. A failed later API page causes no DB writes.
Success logs include pages, fetched records, skipped invalid records, conflicts
(`skippedExisting`, including duplicates within the API result) and inserted
records. Failure logs include the failing stage/offset and progress counts;
uncommitted inserts are never reported as imported.

**Current import policy and limitations:** REST Countries is queried on every
backend startup, even when local records already exist. Existing records retain
their local values when either unique key still matches: the case-insensitive
capital name or the exact country. **Deleted imported capitals can reappear after
a backend restart.** Changing both the capital name and country can also allow
the original record to be imported again, because neither unique key then matches.
Backend startup currently depends on REST Countries being available: a failed
request aborts startup before the API begins listening. These are limitations of
the agreed startup-import policy; no persistent import-completion marker is implemented. The explicit
[Reset to default](#reset-to-default) operation is separate from startup import.

### Capital API

All capital objects have the shape shown in the Data section. The API uses JSON;
POST and PUT require `Content-Type: application/json`.

`flagCode` is read-only response metadata (`"DE"`, `"CZ"`, or `null`), derived from
`names.common` and validated `codes.alpha_2` in **all pages** of the v5 startup
import, including countries without valid capitals. The shared metadata lookup
stays in memory and is published only after a successful import transaction; no DB migration is
needed. Names match after trimming and lowercasing, without aliases or fuzzy
matching. Conflicting or invalid metadata and unknown names resolve to `null`.
GET list/name and successful POST/PUT derive the code from the record's current
country, including existing and manually created rows. POST/PUT still accept
**only** `name`, `country`, `latitude`, and `longitude`; sending metadata fields is rejected.

`continents` is read-only response metadata (`string[]` or `null`), from the v5
[`continents` field](https://restcountries.com/docs/countries#field-reference),
not `region` or coordinates. The existing normalized country-name lookup collects
both fields across every startup page, including countries without capitals, and
publishes them only after import commits. Verified on 25 October 2026 against 254
live records: Africa, Antarctica, Asia, Europe, North America, Oceania and South
America. North/South America remain separate. Multi-continent countries match each
listed continent; no classification is inferred. Values are trimmed, matched
case-insensitively, deduplicated and ordered by the supported labels. Missing,
empty, unsupported, malformed or contradictory continent sets yield `null` for
that country; duplicates with the same normalized set are accepted. Ambiguity is
sticky across pages, independently of flag validity. GET/list/name, successful
POST/PUT and reset decorate the record's **current country** from the same lookup.
Reset immediately retains metadata; it needs no additional fetch or migration.
The frontend validates optional metadata and treats unknown/invalid countries as
unmapped. Metadata refreshes on backend restart.

Capital popups show exactly three read-only country facts: **Continent** (all
verified continents), **Country population** (the whole country, not the city),
and **Currency** (all valid names/codes). `population` (`number | null`) and
`currencies` (`{ code: string; name?: string }[] | null`) come from the existing
[REST Countries v5](https://restcountries.com/docs/countries) backend startup
import and in-memory lookup. Only safe nonnegative integer populations are
accepted, including zero. Currency codes/names are validated and deduplicated;
conflicting metadata becomes unknown independently for each field. Missing facts
display `—`. Opening a popup makes no additional requests; changing its country
refreshes or clears all facts after the confirmed response. POST/PUT still accept
only the original four editable fields and reject all metadata fields.

| Method | Path | Success response |
| --- | --- | --- |
| GET | `/capital` | 200, a plain array of all capitals (`[]` when empty), ordered by case-insensitive name then ID |
| GET | `/capital/:name` | 200, one capital matched by case-insensitive name; URL-encode the name |
| POST | `/capital` | 201, the created capital with its generated integer ID |
| PUT | `/capital/:id` | 200, the fully updated capital with the same ID |
| DELETE | `/capital/:id` | 204, no response body |

POST and PUT both require exactly `name`, `latitude`, `longitude` and `country`.
Names and countries must be nonblank strings without NUL characters; surrounding
whitespace is trimmed before storage. Coordinates must be JSON numbers (numeric
strings are rejected), with latitude in [-90, 90] and longitude in [-180, 180].
Unknown fields, including a body `id`, are rejected. PUT replaces all four editable
fields; it does not accept partial updates. IDs must be decimal integers from 1
through 2147483647 without leading zeros. Name uniqueness is case-insensitive;
country uniqueness uses the exact stored text.

Errors from these routes have the shape `{"error":"message"}`:

| Status | Meaning | Example message |
| --- | --- | --- |
| 400 | Invalid body, coordinates, name or ID; malformed JSON | `Invalid request data` |
| 404 | Capital name or ID does not exist | `Capital not found` |
| 409 | Capital name or country conflicts with an existing record | `Capital name or country already exists` |
| 415 | Unsupported request content type | `Content-Type must be application/json` |
| 500 | Unexpected database/server failure | `Internal server error` |

SQL errors, stack traces and credentials are never returned by the capital routes.
`/health` keeps its existing database-backed behavior.

For manual checks, first follow the [development setup](../README.md#development),
or run only the API with `npm run dev -w backend`. Startup still needs the schema,
PostgreSQL and a valid REST Countries key. After the startup import completes:

```bash
curl -s http://localhost:3001/capital
# Example response: [{"id":1,"name":"Berlin","latitude":52.52,"longitude":13.405,"country":"Germany"}, ...]
curl -s http://localhost:3001/capital/bErLiN
# Example response: {"id":1,"name":"Berlin","latitude":52.52,"longitude":13.405,"country":"Germany"}

curl -i -X POST http://localhost:3001/capital \
  -H 'Content-Type: application/json' \
  -d '{"name":"Example City","latitude":10,"longitude":20,"country":"Example Country"}'
# 201: {"id":<generated-id>,"name":"Example City","latitude":10,"longitude":20,"country":"Example Country"}

# Replace <id> below with the integer returned by POST.
curl -i -X PUT 'http://localhost:3001/capital/<id>' \
  -H 'Content-Type: application/json' \
  -d '{"name":"Updated City","latitude":11,"longitude":21,"country":"Updated Country"}'
# 200: {"id":<id>,"name":"Updated City","latitude":11,"longitude":21,"country":"Updated Country"}
curl -i -X DELETE 'http://localhost:3001/capital/<id>'
# 204, empty body
curl -i http://localhost:3001/capital/NoSuchCapital
# 404: {"error":"Capital not found"}
```

These write examples change data in the database used by the running API.
For automated checks, `npm test` runs Fastify `inject()` success/error tests with
a mocked DB, without starting the importer or listener. Use the [disposable
PostgreSQL example](testing.md#isolated-postgresql-integration) to verify actual CRUD SQL, uniqueness conflicts on POST
and PUT, persistence after updates/deletes, and existing importer/health behavior.

## Frontend

The React app loads `GET /capital` on mount using native `fetch`. The typed client
expects the backend's plain array of capital objects, validates the response and
reports HTTP, network and malformed-response errors. `frontend/src/capital-store.ts`
uses Zustand as the shared source for capitals, loading and error state. Its
`fetchCapitals` action also supports reload/retry and shares an in-flight request
between callers, including React effect remounts, so responses cannot race.

Follow the [development setup](../README.md#development) for credentials, ports and startup.

The browser requests the same-origin relative URL `/capital`. Vite's **development**
proxy forwards `/capital` requests to `http://127.0.0.1:3001`, using `PORT` from
the process environment or root `.env` when set (restart Vite after changing it).
No client-side API URL or additional environment variable is required. The REST
Countries key and database URL stay server-side. A production host must route
`/capital` to Fastify on the same origin; the static build and `vite preview`
do not provide the development proxy.

At **700px and below**, the app starts in **Map** with a fixed **Map / Capitals**
bottom navigation. **Capitals** opens the existing list, search, continent filter,
Add and Reset controls. Search matches capitals/countries in the list only;
continent filtering also controls visible map markers. Selecting a list row
returns to Map, resizes the existing map, flies to the capital and opens its popup.
Selecting a marker stays on Map; opening Capitals later reveals its selected row
when allowed by the current filters. Switching views preserves search, continent,
list position, camera, data and marker colors without another API read or map
initialization. Use Left/Right or Home/End on the tabs to switch with a keyboard.

**Pick on map** temporarily shows Map while retaining the create/edit draft;
choosing coordinates, Cancel or Escape restores the form and previous view.
Only Create/Save writes data. Native CRUD/reset dialogs and the popup's facts,
Edit/Delete actions and four persistent marker colors remain available. Success
feedback appears above the bottom navigation and safe area. Above 700px the
existing desktop sidebar/map layout and independent sidebar toggle remain.

The English sidebar shows each capital name above its country, preserving API order.
On desktop, use the chevron button at the map’s upper-left corner to collapse or expand the
sidebar. Collapsing keeps the search and list state and frees space for the map;
hidden sidebar controls are excluded from keyboard navigation. The map remains
mounted and retains its view and marker colors.

Search countries or capitals using the labeled search field. Matching ignores case
and surrounding whitespace and filters only the list; all map markers remain.
The count beside the heading is the full dataset total, while search reports the
matching count out of that total, including a clear no-matches message.
The explicit **Clear search** (×) button appears for any nonempty query, clears
only that text and returns focus to the search field. The continent filter,
selection, markers and camera stay unchanged. The **Skip to map** link becomes
visible on keyboard focus.

During a request it announces “Loading capitals…”. An empty array shows “No capitals
available yet.” Errors show a readable message and a keyboard-accessible “Try
again” button, which fetches again and clears the previous error. Existing data
is retained in the store during reload/failure but hidden by the status message;
a successful response replaces it, including when the new array is empty.

### Create, edit and delete capitals

Choose **Add capital** above the list to open the form. Enter a capital name,
country name, latitude and longitude, then choose **Create capital**. Choose
**Actions for [capital]** (the three-dot button) beside an entry, then **Edit**
to change the same four fields and **Save changes**. Choose **Delete** from that
actions panel and review the capital/country in the confirmation,
then choose **Delete capital**. **Cancel** or Escape closes either dialog without
writing. While a request is pending, controls and dismissal are disabled to avoid
duplicate submissions. Success appears briefly at the bottom center of the window.

**Pick on map** optionally fills latitude and longitude in both create and edit.
The modal temporarily closes while keeping the draft; click the map to return
with coordinates to six decimal places and a temporary preview. Name and country
stay unchanged. **Cancel** in pick mode or Escape returns to the form with the
previous coordinates. Only **Create capital** / **Save changes** writes data.
Canceling the form discards its draft and preview. Manual coordinates remain
editable; if the map is unavailable, picking is disabled with an explanation.

You can also open a capital's marker popup and choose **Map actions for [capital]**
(⋮) in its header, then **Edit** or **Delete**. Both entry points share one actions
panel and the same dialogs, validation and store mutations. The dialogs and success
feedback also work with the sidebar collapsed. Escape closes the actions panel
first; outside click dismisses it. Closing a dialog returns focus to its trigger
when available, or a visible Add capital button/map canvas after deletion or a
filter exclusion. Opening/canceling a dialog does not navigate the map. Confirmed
edits update popup data and marker position by ID, retaining color; only coordinate
changes use the existing camera movement. Country edits respect the continent
filter without changing the search or removing records from the full dataset.

All fields are required. Blank names/countries and invalid characters are rejected;
latitude must be a finite number in [-90, 90] and longitude in [-180, 180]. Field
errors are linked to their inputs and the first invalid input receives focus.
Coordinates are sent as JSON numbers. Edit sends the complete record using its
original database ID. Duplicate capital names (case-insensitive) or countries
(exact match), missing records, invalid requests and server/network failures show
safe messages inside the dialog and retain entered values. Requests time out after
15 seconds. A lost/malformed response can leave a write's outcome uncertain:
cancel and reload the page before retrying. No server internals are displayed.

The typed client reuses the existing POST/PUT/DELETE endpoints (including DELETE's
empty 204 response). After each confirmed write, Zustand applies the returned
record or removes its ID in the shared array, keeping names ordered
case-insensitively. No optimistic writes, follow-up GET or full page reload is
needed. Reads and mutations cannot overlap in the UI/store. The list and existing
Mapbox marker lifecycle consume the same state: names/popups and coordinates
update, deleted markers/popups disappear, and the map instance and other marker
colors remain intact. Reload/refresh retrieves PostgreSQL data; other browser
sessions are synchronized only when refreshed. Dialogs support keyboard operation,
restore focus to the initiating control, and fall back to Add capital after deletion
or when an edited entry no longer matches the search. Actions panels open with
Enter or Space; Tab moves through Edit and Delete, Escape closes and restores
focus to the three-dot button, and leaving the actions or clicking outside closes them.
The compact panel uses a measured portal outside the scroll region, with viewport
clamping; opening never changes row heights or scroll position. Scrolling, resize,
filter changes and collapse close the panel.

Confirmed create, update, delete and reset results appear as a small polite status
at the bottom center of the viewport for about three seconds, without shifting
list content or taking focus. Starting another operation clears the previous notice; a new success
starts a fresh timer, which is also cleaned up on unmount. Errors remain visible
in the existing dialog/retry flow until handled.

**Persistence limitation:** CRUD writes are stored in PostgreSQL, but REST Countries
is reimported on **every backend startup**. Deleted imported capitals can reappear
after a restart; editing both unique names can also allow the original to return.
Reset to default, described below, is separate from this unchanged import policy.

### Reset to default

Choose **Reset to default**, directly beside **Add capital**, and review the
confirmation before choosing **Reset capitals**. **Cancel** or Escape before
submission writes nothing. During the request, dismissal and duplicate submission
are disabled; progress, success and safe errors are announced. Focus starts on
Cancel and returns to Reset to default after closing.

Reset replaces **all rows in capitals**, including manually created rows, with
the reviewed `default-v1` source dataset in `db/default-capitals.json`:

- Restore default capital names, countries, latitude and longitude.
- Recreate deleted default capitals and delete all manually added capitals.
- Generate new database IDs without restarting the identity sequence; clear the
  selection and popup. Gaps after a failed transaction are harmless.
- Reset all marker colors to **Teal #216278** and remove saved browser colors. Keep the
  Mapbox instance, canvas, current camera, search and sidebar state; markers
  themselves are replaced because their IDs change. Markers remain 32×32 px.

The snapshot was captured on **25 October 2026** from all three pages of REST
Countries v5: 254 country records, five without a valid first capital, and 248
stored capitals. Two valid capitals share the unique name Kingston: Jamaica's
first occurrence is retained; Norfolk Island's duplicate is explicitly recorded
in the snapshot metadata, matching the startup import's conflict policy.
Only the four editable fields are frozen, with no IDs or credentials. Snapshot
SHA-256: `f27e2cb2f64a5ebbf8574c56e14628f6ddd477e8150bd6e9ff73727686d03fa4`.
The historical first import cannot be reconstructed from edited existing rows;
`default-v1` is the approved definition of default. Updating it requires an
explicit reviewed source-data change, never a fresh fetch during reset.

`POST /capital-reset` requires JSON `{ "confirm": true }` and returns HTTP 200
with the complete restored capital array, enriched with existing country metadata.
The existing five CRUD endpoints and DB-backed `/health` retain their contracts.
One checked-out pg client performs BEGIN, a table write lock, DELETE, parameterized
INSERTs, result selection and COMMIT. A failure rolls back the transaction and
returns a safe error; success is reported only after COMMIT. Lock/statement
timeouts bound blocked queries. Concurrent resets in the same backend process
return 409; database locks serialize other writers/processes. New writes after
commit remain possible. A deliberately repeated reset is another full replacement
with new IDs; there is no request-ID or persistent deduplication mechanism.

**Public demo limitation, explicitly accepted for this take-home:** this endpoint
has **no authentication or token**. Anyone who can reach the API, including any
visitor to a public demo, can replace everyone's capital data and delete custom
entries. The dialog and `confirm` field prevent accidental UI actions; they are
not authorization. There are no localhost/origin restrictions or automatic
backups. Use this application only with disposable demo data, not valuable user
data. This accepted design supersedes the earlier local-only proposal in #19.

Zustand applies only the confirmed response. No optimistic reset or automatic
POST retry occurs. A timeout, dropped connection or malformed response can leave
the commit outcome uncertain: the dialog offers **Reload current data**, a plain
GET, without another reset or a success claim. Close and confirm a new reset only
after reviewing the current state. If that read fails, Cancel and use the existing
**Try again** list recovery. The normal sidebar has no Refresh list button;
automatic initial loading, store reads and browser reload still work.

Reset itself needs no REST Countries network request. Startup still imports live
data and fails if REST Countries is unavailable; later restarts may supplement
the frozen dataset with new API records. Other browser sessions receive no push
and retain their current view/colors until they reload data; new IDs then replace
their old markers. Reset does not change the map view or store colors in the DB.

Reset route/store/marker tests use mocks. The optional reset PostgreSQL suite uses
only explicit `TEST_DATABASE_URL`, its own temporary schema and the disposable
database described in [Testing](testing.md#isolated-postgresql-integration). Never run reset tests against the normal development
database. `frontend/test/reset.browser.mjs` covers confirmation, Cancel, focus,
pending/double-click protection, failures, lost-response/read recovery, Teal,
selection/popup clearing, retained canvas/camera and 32×32 px markers at
1440×900, 390×844 and 320×568, using mocked capital traffic and real Mapbox.

Focused Node tests cover mutation HTTP contracts/errors, required/bounded fields,
pending requests and shared-state updates. Interactive cancellation, focus,
list/marker synchronization and desktop/mobile layouts are checked separately
in a real isolated Chromium session against disposable PostgreSQL.

On desktop the list scrolls beside a map that fills the remaining space; the
collapse/expand button stays at the map’s upper-left corner. At 700px and below,
Map / Capitals tabs show one pane at a time.
Mapbox initializes independently of capital data; a resize
observer keeps its canvas sized to its panel and is disconnected along with the
map on unmount. A missing Mapbox token shows setup guidance while the list still
works.

Select a capital row with a click, Enter or Space to fly to its coordinates at a
regional zoom and open its popup. Selecting it again repeats the navigation;
choosing another capital interrupts the previous flight. Reduced-motion settings
make navigation immediate. The camera measures the map/popup bounds; on narrow
screens the map scrolls into view. The three-dot actions button and its Edit/Delete
controls operate independently and do not navigate.

Each valid capital in the shared store has a square **32 × 32 CSS pixel** marker
with a location glyph at its longitude/latitude. Click a marker, or focus it with
Tab and press Enter or Space, to open its popup and select the matching list row.
Selection is indicated by the highlighted row, marker outline and pressed button
state. Marker activation centers a matching row inside the list scroller, clamped
at the beginning/end, without moving the page or popup focus, opening a closed
sidebar or changing the search query. Repeated activation reveals it again;
unrelated data updates do not recenter the list.

Popups show the capital, country, latitude and longitude. Choose one of the named
Teal, Red, Purple or Gold swatch buttons in the “Marker color” group to update only
that marker immediately. The active swatch has a checkmark and a pressed state.
Escape or the close button closes the popup, clears selection and returns keyboard
focus to its marker; clicking the map also closes it. Focus moved elsewhere is
respected. Long popup content scrolls within the available map height.

Marker colors survive page reloads in the same browser via native `localStorage`
(`map-capital-cities.marker-colors.v1`, a JSON object of capital ID → color).
Only non-Teal overrides from the four-color palette are stored. Colors are never
sent to the server and do not follow you to other browsers or devices. Edits keep
colors by ID; confirmed deletes and creates remove stale overrides for that ID.
**Reset to default** clears saved colors after confirmed success, so reloads stay
Teal. Failed or uncertain writes/reset responses retain the current colors.
If browser storage is unavailable, blocked, full or damaged, the app remains usable
with in-memory colors; persistence across reloads cannot be guaranteed. A blocked
storage removal can also leave an old override on disk. Changes in other tabs or
external ID reuse are not synchronized; the app can clean up only known changes.

Markers retain their current colors and instances across popup reopening, search,
continent filtering, sidebar toggles, rerenders and data reads. Edited popup
text/coordinates update immediately; a selected coordinate edit moves the camera
to the new location. Removed capitals release their markers and selection; new
capitals start Teal.
The map stays mounted during these interactions. Markers, popups, event listeners
and the resize observer are cleaned up on unmount. Map initialization/load failures
show readable feedback while independent list CRUD remains available.

The “Map could not load” message is reserved for a construction failure or a lost
WebGL context; context restoration clears the latter. Generic Mapbox errors have
no reliable fatality flag. Before the initial style is ready, they show a neutral
resource warning that clears on `style.load`. After style readiness, individual
resource errors do not mark the whole map unavailable. Other runtime failures
cannot be classified reliably from the generic event alone.

Markers can overlap at world zoom levels; zoom in to distinguish nearby capitals,
or select a capital from the list or keyboard. No clustering or positional offsets
are applied. Mapbox's globe projection can hide capitals on the far side; drag the
map or select a list row to reach them. Map tiles require a working Mapbox token
and network. City photos are not implemented.

The list and selected popup show decorative 40 × 30px country flags from the
[official flag CDN](https://restcountries.com/flags), using only validated alpha-2
codes in `https://flags.restcountries.com/v5/svg/{lowercase-code}.svg`. Missing,
invalid, ambiguous or unknown metadata and failed images show a neutral globe
in the same fixed space. The globe also remains visible while an image loads;
only a successfully loaded image replaces it, including cache hits and country
changes. The browser makes no additional country API request;
country edits replace the flag after a successful save. Metadata refreshes only
on backend restart, and flag images require CDN access.

The native **Continent** dropdown beneath search defaults to **All continents**.
Text search matches trimmed, case-insensitive capital/country names in the sidebar
only. A continent filters both sidebar and map; the sidebar combines the two with
AND. For example, Europe + Tokyo shows no list matches but keeps all European
markers. The count shows matches out of the full dataset. Unknown countries stay
visible under All continents and are excluded from specific continents. Clearing
search and choosing All continents are independent actions, including after reset.

Filters leave the canonical capital array and camera unchanged. Marker visibility
is separate from data updates: hidden markers retain instances and colors, are
disabled and leave the tab order. An excluded selection closes its popup without
focusing a hidden marker. Country edits/new records/reloads reconcile visibility;
actual deletion still releases markers, and reset retains its existing Teal policy.
The Mapbox instance stays mounted throughout.
