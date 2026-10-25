---
name: fastify-http
description: "Implement or review Capital Cities Fastify 5 routes, registration scope, request validation, HTTP contracts, errors and inject tests with safe pg integration. Use for API transport work; not UI-only, SQL-only or deployment-only tasks."
---

# Fastify HTTP

Follow root AGENTS.md, README's Capital API contract and the active task. Inspect
the affected route, database operation, tests and frontend callers before editing.
Keep Node 24.22.1, npm 11.19.1, TypeScript and the existing Fastify 5/`pg` stack.

## Trace registration and execution

Start at `backend/src/app.ts`: `buildApp(database = pool)` constructs the app
without importing data or starting a listener. CORS and `/health` are registered
at the root; `capitalRoutes` is registered inside an encapsulated child plugin.
Its error handler must stay scoped so it does not change `/health` failures.
Parent hooks/parsers apply to descendants, not sibling plugins. Inspect order
and scope before adding hooks, parsers or decorators.

Walk routing → `onRequest` → `preParsing` → parsing → `preValidation` → validation
→ `preHandler` → handler → serialization → `onSend` → `onResponse`. The body is
unavailable in `onRequest`; the existing content-type check reads headers there.
Use promises or `done` in a hook, never both. Return/await early replies and
request-affecting work; do not send a second response or detach database promises.
For method/path changes inspect HEAD, CORS preflight and frontend callers.

## Preserve the wire contract

Use trusted static JSON schemas and route TypeScript generics together; types
alone do not validate JSON. `buildApp` disables coercion and extra-field removal.
Preserve rejection of numeric strings, unknown fields and invalid coordinates;
POST/PUT require all four editable fields. Inspect absent/null values, blank/NUL
text, ID bounds and JSON content types, including malformed JSON before handlers.
Do not compile user-supplied schemas or perform database checks inside validation.

Keep the plain capital array/object responses, generated IDs, full PUT updates,
201 on create and empty 204 on delete. Check README for exact paths/statuses.
Preserve safe capital error mapping (400, 404, 409, 415, 500) and `{error: message}`
payloads; do not leak SQL, stack traces or credentials through responses or logs.
If adding response schemas, ensure serialization retains required contract fields.

## Integrate the database safely

Keep parameterized queries in `backend/src/capitals.ts` behind `CapitalDatabase`
and the existing `pg` pool in `backend/src/db.ts`; do not add an ORM or new pool
per request. Respect uniqueness constraints and distinguish conflicts from
unexpected failures. Multi-query transactions use one checked-out client with
commit/rollback and release in `finally`. Do not retry uncertain writes blindly.

Preserve `backend/src/env.ts` loading the root `.env` before pool creation.
`backend/src/index.ts` owns readiness, startup import, listening (default 3001)
and pool shutdown. `GET /health` must query `select 1` and fail when the DB is
unavailable. Route tests must not import the bootstrap or trigger the importer.

## Choose evidence

Use `buildApp(fakeDatabase)` and `app.inject()` as in
`backend/test/capital-routes.test.ts` and `backend/test/health.test.ts`. Always
close the app with test cleanup. Test registered routes, not just helpers:
success, malformed JSON, unsupported media type, invalid data, missing records,
uniqueness conflicts and unexpected DB rejection. Assert status, headers and
safe payloads, including no DB call for rejected input and no body on 204.

Run the checks in AGENTS.md. Inject/fake-DB tests cannot prove PostgreSQL SQL,
constraints, rollback or browser CORS behavior. When DB evidence is needed, use
README's disposable test database and explicit `TEST_DATABASE_URL` with
`backend/test/postgres.test.ts`; never substitute the development `DATABASE_URL`.
Do not reset a database or modify application data to run a transport review.

For version-specific questions consult installed Fastify docs under
`node_modules/fastify/docs/` (Reference: Encapsulation, Lifecycle, Hooks,
ContentTypeParser, Validation-and-Serialization, Reply; Guides: Testing).

## Attribution

Adapted from [Quiz-Mate's original fastify-http guidance](https://github.com/Toiibox/Quiz-Mate/blob/97a36aa2427392755cf6cd3ee4542bebece99fc7/.agents/skills/fastify-http/SKILL.md).
Modified for this backend: removed foreign authentication, routing and actor/RLS
assumptions; added its route/health contracts, `pg` boundary and test entrypoints.
The [source curation record](https://github.com/Toiibox/Quiz-Mate/blob/97a36aa2427392755cf6cd3ee4542bebece99fc7/docs/reports/issue-92-domain-skills.md)
identifies original local writing; no skill-specific license or repository-wide
LICENSE was present at that pin. No third-party license is inferred from Fastify.
