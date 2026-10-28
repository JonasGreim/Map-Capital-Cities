# Free Render deployment

[Project overview](../README.md) · [Local Docker setup](development.md) · [Testing](testing.md)

This prepares Issue #65; it does **not** provision or publish anything. Merge the
deployment PR before creating the Blueprint from `main`. Issues #69/#70 are already
integrated: PostgreSQL owns the import state/metadata and the frontend handles a
slow initial request. There is no verified public demo URL yet.

## Architecture and cost boundary

| Resource | Blueprint configuration | Connection |
| --- | --- | --- |
| `map-capitals-web` | Static Site, globally served; root workspace build | Browser calls the API's public HTTPS URL |
| `map-capitals-api` | Docker Web Service, **Free**, Frankfurt | Internal `DATABASE_URL` from the database reference |
| `map-capitals-db` | PostgreSQL **16**, **Free**, Frankfurt | External database access disabled with `ipAllowList: []` |

Only the owner creates these resources. Do not select paid instances, disks,
preview environments or upgrades. Static sites have no compute `plan` property;
adding `plan: free` to the static service is not supported. API and DB explicitly
select `free` to avoid paid defaults. Both services deploy from `main` only after
its CI checks pass. No separate frontend Docker server is needed on Render.

The backend image already contains `db/schema.sql` and `db/default-capitals.json`.
It binds to `0.0.0.0:$PORT` (Render supplies the port; local default remains 3001).
The static build pins Node 24.22.1 and uses Render's provided npm to install the
root workspaces, including development tools, and build the frontend:

```bash
npm ci --include=dev && npm run build -w frontend
```

Node 24.22.1 [bundles npm 11.19.1](https://github.com/nodejs/node/blob/v24.22.1/deps/npm/package.json),
matching the repository's npm version; no version override is needed. A global
npm installation attempts to modify Render's read-only system installation
(`/usr/lib/node_modules/npm`) and fails with `EROFS` before dependency installation.
`SKIP_INSTALL_DEPS` avoids Render's earlier implicit install. Local validation
does not establish that the actual Render deployment succeeds; verify its build
logs after deployment.

## Owner setup in the Render Dashboard

1. Create/sign into a Render account and use a **Hobby workspace**. Review Billing:
   do not enable paid resources. To keep this demo at zero cost, do not add a
   payment method; included-usage exhaustion can then suspend services/builds
   instead of billing overages. If a card is already present, review billing and
   spend controls before proceeding: a build-pipeline spend limit does **not**
   by itself guarantee that bandwidth overages cannot be billed.
2. Connect GitHub and authorize Render's GitHub App for the private
   `JonasGreim/Map-Capital-Cities` repository. Keep repository access restricted to
   the required repository. Ensure no other Free Postgres is active in this
   workspace; Render permits only one.
3. Select **New → Blueprint**, connect that repository, select `main`, and use
   the root `render.yaml`. Review the proposed changes: exactly one static site,
   one Free API and one Free PostgreSQL 16 in Frankfurt. Do not apply a proposal
   containing paid plans. Service names can receive a suffix if already taken.
4. Fill the four prompted settings below. The example service URLs are **planned
   placeholders**, not verified deployments. Use the actual URLs displayed by
   Render; neither an internal API hostname nor a PostgreSQL URL belongs in Vite.

   | Service / setting | Value supplied by the owner |
   | --- | --- |
   | API / `RESTCOUNTRIES_API_KEY` | Private REST Countries v5 bearer key; runtime only, needed for the first successful DB initialization |
   | API / `CORS_ORIGINS` | Exact static-site origin, e.g. `https://map-capitals-web.onrender.com`; no trailing slash/path; multiple origins comma-separated |
   | Web / `VITE_MAPBOX_TOKEN` | Public `pk` Mapbox token with the existing map's required scopes; authorize the final static-site URL in Mapbox |
   | Web / `VITE_API_BASE_URL` | Public API HTTPS origin, e.g. `https://map-capitals-api.onrender.com`; no secret/key/query string |

5. Apply the Blueprint only after reviewing Free plans and secrets. It supplies
   `DATABASE_URL` through `fromDatabase.connectionString` and enables
   `PUBLIC_DEMO=true`; do not paste DB credentials into YAML. The API health check
   is `/health`; schema creation/import happen in ordinary container startup,
   without a shell, one-off job or pre-deploy migration command.
6. Confirm the actual `onrender.com` URLs on both services. If Render assigned a
   suffix, correct `VITE_API_BASE_URL` on the static site and `CORS_ORIGINS` on the
   API in **Environment**. Redeploy the API and **rebuild/redeploy the static
   site**. Vite settings are embedded in the built JavaScript; restarting only the
   API cannot update them. `sync: false` settings are entered at creation and
   retained on later Blueprint syncs, not re-prompted on every sync.
7. Check **Events/Deploys** for a successful build and healthy API. Only after the
   live checks below succeed should the real public demo link be added to README.

Never put `.env`, private REST Countries keys, DB URLs/passwords, dashboard
screenshots containing secrets or generated build artifacts in Git. Vite's
`VITE_*` values are public; only public Mapbox/API settings belong there.
Use a dedicated public Mapbox token with `styles:read` and `fonts:read` and an
allowed URL matching the actual static-site origin. Default public tokens cannot
be URL-restricted; do not assume that editing a default token adds protection.
For local smoke tests authorize `http://localhost:5190` on a suitable separate
test token (URL restrictions do not support IP addresses or wildcard characters).
Mapbox usage/trial limits are separate from Render's zero-cost compute plans;
the owner must review their existing Mapbox account's usage before publication.

## First boot, persistence and reset

On an empty managed database, startup obtains a transaction advisory lock,
fetches the paginated REST Countries data, applies the idempotent schema, and
commits capitals, metadata and the completion marker together. An error rolls
back the initialization; fix the key/connectivity and redeploy rather than
marking an incomplete import as successful. `/health` becomes available only
after initialization and actually queries PostgreSQL.

Later starts load metadata directly from PostgreSQL, do not validate/use the
REST Countries key, and do not fetch or reset capitals. The private key can be
removed from the API's environment after successful initialization; keep a valid
key available privately for a replacement database. Manual CRUD edits and
deletions survive API restarts. No persistent container filesystem is required.

This is an intentionally **public, anonymous, shared CRUD demo**. Any visitor can
create/edit/delete and use **Reset to default**. Reset replaces capital rows with
the checked-in snapshot for everyone and keeps the stored country metadata.
It is not an account-specific operation, authentication or a backup facility.
The data is disposable; do not enter personal or valuable information.

## Browser configuration and safety

Without `VITE_API_BASE_URL`, all calls retain the existing relative paths for
Vite's development proxy and the Nginx Compose proxy. With it, GET, POST, PUT,
DELETE and reset all use the same configured base. No external rewrite/proxy is
needed on the Static Site. HTTPS API access avoids browser mixed-content errors.

`CORS_ORIGINS` permits only exact configured HTTP(S) origins, JSON preflights and
the existing methods. Production without an allowlist grants no cross-origin
access; local same-origin Docker calls continue working. Development retains its
existing permissive default. Adding a custom frontend domain requires updating
this allowlist, Mapbox restrictions and rebuilding any changed Vite settings.
CORS is **not authentication**; direct API clients can still send requests.

`PUBLIC_DEMO=true` enables two shared per-instance one-minute budgets:

- 60 attempted POST/PUT/DELETE capital writes, across all write routes.
- 3 attempted resets, independent of the capital-write budget.

Rejected/invalid attempts also consume their budget. GET/HEAD/OPTIONS and health
remain available. A blocked write returns 429 with `Retry-After` and the UI asks
the visitor to wait a minute; it does not retry an uncertain write automatically.
Budgets deliberately apply to **all visitors together**, reset on a process
restart, and are not a distributed/per-user fairness or DDoS guarantee. A visitor
can exhaust the shared allowance temporarily. This is a small disposable demo,
not an authenticated multi-tenant service.

Fastify keeps `trustProxy: false`. The budgets use two constant keys rather than
`X-Forwarded-For`, `Forwarded` or a guessed Render proxy-hop count, so a forged IP
header cannot create a fresh quota or grow an IP-key cache. Bodies are limited to
16 KiB, names/countries to 200 characters, and receiving a request has a 15-second
deadline. Existing JSON schemas, parameterized SQL, query/transaction limits,
reset serialization and safe errors remain in place. Health failures do not
return database diagnostics or credentials.

## Live acceptance checks — owner still needs to perform these

1. Open the API's HTTPS `/health` and expect `200 {"ok":true}`. Check `/capital`
   returns an array and `/capital/Berlin` returns one record with country facts.
2. Open the Static Site in a fresh browser at desktop, 390px and 320px. Confirm
   Mapbox, square markers, flag images, continent/population/currency facts,
   search/filter, selection and keyboard focus. In Network, all capital requests
   must target the public API HTTPS origin; no private hostname or REST key may
   appear in frontend assets or requests.
3. Create a uniquely named disposable capital, edit it, reload and delete it.
   Use manual Reset once and confirm the default list returns. Verify the JSON
   preflight and CORS headers with the real static origin. A different Origin
   must not receive `Access-Control-Allow-Origin`; direct curl is still allowed.
4. Make a visible edit, restart/redeploy the API, and confirm both that edit and
   country facts remain. Startup logs should say `mode: 'loaded'`, not `seeded`;
   repeat with the REST Countries key removed after the first successful import.
5. Leave the API idle for **more than 15 minutes** without health pings or browser
   polling. The static site should still load immediately. Its initial GET has
   a 120-second budget; after about five seconds the non-blocking explanation
   appears and after success it disappears. Writes/reset still have 15 seconds.
   If the request fails, a visible error/keyboard-operable **Try again** must work
   on the mobile Map tab, collapsed desktop sidebar and open capital list.
6. Exercise allowed and rejected origins, an oversized body and write/reset 429
   responses on the disposable demo. Monitor console/network and Render usage.

Do not claim these checks passed until a real public Render deployment is tested.
The local production smoke described in [Testing](testing.md) exercises separate
HTTP origins, real PostgreSQL/Docker/Mapbox and built static assets; it does not
establish Render TLS, GitHub authorization, assigned URLs, proxy behavior or a
real Render idle wake-up.

## Free-plan operations and database replacement

Verified against official documentation on 28 October 2026; recheck before launch:

- Free API instances spin down after roughly 15 idle minutes; waking takes about
  a minute. Do not add keep-alive pings. Render can restart a free instance at any
  time. There is no Free shell, persistent disk or one-off job facility.
- Each workspace receives 750 Free instance hours per month. Static sites do not
  sleep, but both services consume included bandwidth/build pipeline usage.
  Exhaustion/overages can suspend builds/services or incur charges with a payment
  method; check **Billing → Monthly Included Usage** and avoid paid upgrades.
- Free PostgreSQL: one active Free DB per workspace, 1 GB, **expires after 30
  days**, no backups. After expiry it is inaccessible without a paid upgrade;
  Render deletes it after a further 14-day grace period. Do not rely on that
  period as free access or backup. Schedule an owner reminder before expiry.

For disposable replacement: save nothing valuable in this demo. The owner stops
the API, deliberately removes the expired/old disposable DB in the Dashboard
after checking its identity, and creates a new **Free PostgreSQL 16** in the same
region. To keep the Blueprint authoritative, change its database `name` and the
API's matching `fromDatabase.name` in a follow-up PR, then review/sync the Blueprint.
Only one Free DB may be active; do not approve a paid replacement or assume that
removing a YAML entry deletes an old resource. Re-enter the private REST Countries
key before starting the API against the new connection. First startup creates the
schema/imports data again; verify `/health`, facts, CRUD and reset. The static
site needs no rebuild if its API URL is unchanged. Remove the import key again
after success if desired. Verify no unmanaged old resources remain in Billing.

For a different PostgreSQL provider, keep schema/bootstrap code unchanged and set
the API's `DATABASE_URL` to that provider's connection string and required TLS
options. Replace the Blueprint's `fromDatabase` entry with `sync: false`, set the
actual secret in the Dashboard, and redeploy the API. Prefer a system-trusted CA;
follow the provider's certificate requirements rather than disabling verification.
Disposable visitor changes need not migrate: a fresh DB reimports metadata and
capitals. If preservation is later required, arrange a deliberate `pg_dump`/restore
before expiry, including `capitals`, `country_metadata` and `import_state`; the
owner must temporarily allow their own IP for an external DB export, then revoke
it. Never restore a completion marker without the corresponding schema/metadata.

## Troubleshooting

- **API not healthy:** examine API Deploys/Logs. Safe readiness/import errors
  distinguish missing key, invalid data and database startup. Check DB region,
  availability/expiry, `DATABASE_URL` reference and first-import key. Do not paste
  raw connection strings or keys into issue comments. A failed import is retryable
  on redeploy; no SQL-console "mark complete" workaround is needed.
- **CORS or failed fetch:** compare the browser's exact Origin with
  `CORS_ORIGINS`; verify the API's public HTTPS URL. Rebuild the static site after
  changing `VITE_API_BASE_URL`. Relative `/capital` on a separately hosted static
  site means the setting was missing at build time.
- **Map/flags unavailable:** inspect Mapbox URL restrictions, token scopes and
  external CDN requests. Capital loading and map-resource errors are independent.
- **429:** wait the advertised window. Do not spam Retry or restart the service
  to evade limits; other visitors share the allowance.
- **Static build failed:** verify Node/npm versions, root lockfile, dev dependencies
  and `frontend/dist`. Do not set the service root directory to `frontend`.

## Local validation evidence

On 28 October 2026, using Node 24.22.1 and npm 11.19.1:

- Root `npm ci`, `npm run check`, `npm test` with an isolated PostgreSQL 16
  `TEST_DATABASE_URL`, and `git diff --check` passed: **175 tests, no skips**.
- `render.yaml` passed the official published Render JSON Schema (Draft 2020-12),
  parsed as YAML and validated locally with AJV. No Render API/account validation
  or provisioning was performed.
- Both existing Dockerfiles built. The API image bootstrapped a completely empty
  managed-style DB without Compose SQL mounts, using the real REST Countries v5
  API (3 pages, 248 capitals). Recreating the API without a REST key loaded stored
  metadata and preserved a write. Docker port 10000, real CORS, 413/400, 429 with
  forged IP headers and DB-backed health were exercised over HTTP.
- The existing Compose configuration built/started in a separate project, using
  a RAM DB mount instead of any developer volume. Nginx HTTP/health, CRUD/reset,
  metadata, browser Mapbox/flags and retention across API restart passed.
  `npm run dev` also served data through its Vite proxy against the test DB.
- The static production-build smoke passed at 1440/390/320px with a separate real
  Docker API origin, real PostgreSQL, Mapbox and flags, country facts, CRUD/reset,
  controlled slow GET and failed GET/retry. Existing loading/mobile-navigation/
  flags browser suites also passed with their mocked capital requests.
- Frontend assets contained no private REST Countries key or database URL.
  `npm audit --omit=dev` reported zero findings; full audit retains the existing
  Vite high/esbuild moderate advisories. The existing large-bundle warning remains.

These are **local tests**, not a live Render acceptance result. Private GitHub
authorization, actual resource availability/free-plan selection, service URLs,
TLS, account billing/quotas and idle wake-up remain owner/live checks above.

## Official references

- [Blueprint schema and supported fields](https://render.com/docs/blueprint-spec)
- [Free tier and limits](https://render.com/docs/free)
- [Blueprint setup](https://render.com/docs/infrastructure-as-code)
- [Static sites](https://render.com/docs/static-sites)
- [Node version selection](https://render.com/docs/node-version)
- [Default environment variables](https://render.com/docs/environment-variables)
- [PostgreSQL connections](https://render.com/docs/postgresql-creating-connecting)
- [Mapbox URL restrictions](https://docs.mapbox.com/accounts/guides/tokens/)

The checked-in file can be validated against Render's published JSON Schema
without creating resources. An authenticated owner can additionally run
`render blueprints validate render.yaml` (CLI 2.7+); this is validation, not deploy.
Review the Dashboard proposal again because schema validation cannot prove
account quotas, repository access, regional capacity or live service readiness.
