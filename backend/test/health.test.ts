import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";

test("GET /health checks the database before returning ok", async (t) => {
  const queries: string[] = [];
  const app = buildApp({ query: async (sql) => { queries.push(sql); return { rows: [] }; } });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), { ok: true });
  assert.deepEqual(queries, ["select 1"]);
  assert.equal(response.headers["access-control-allow-origin"], "*");
});

test("GET /health does not report success when the database is unavailable", async (t) => {
  const app = buildApp({ query: async () => { throw new Error("Database unavailable"); } });
  t.after(() => app.close());

  const response = await app.inject({ method: "GET", url: "/health" });

  assert.equal(response.statusCode, 500);
  assert.notEqual(response.json().ok, true);
  assert.deepEqual(response.json(), { error: "Database unavailable" });
});

test("CORS preflight preserves the starter's allowed methods", async (t) => {
  const app = buildApp({ query: async () => { throw new Error("Unexpected DB query"); } });
  t.after(() => app.close());

  const response = await app.inject({
    method: "OPTIONS",
    url: "/health",
    headers: { origin: "http://localhost:5173", "access-control-request-method": "DELETE" },
  });

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["access-control-allow-origin"], "*");
  assert.equal(response.headers["access-control-allow-methods"], "GET, HEAD, PUT, PATCH, POST, DELETE");
});
