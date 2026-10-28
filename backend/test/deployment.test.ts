import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";

const unusedDatabase = { query: async () => { assert.fail("Rejected input must not reach PostgreSQL"); } };

test("deployed CORS allows only exact frontend origins and JSON CRUD preflights", async t => {
  const app = buildApp({ query: async () => ({ rows: [] }) }, new Map(), {
    corsOrigins: "https://demo.example, https://other.example", publicDemo: true,
  });
  t.after(() => app.close());
  for (const origin of ["https://demo.example", "https://other.example", "https://demo.example.evil.test", "null"]) {
    const allowed = origin === "https://demo.example" || origin === "https://other.example";
    for (const method of ["GET", "POST", "PUT", "DELETE"]) {
      const response = await app.inject({ method: "OPTIONS", url: "/capital", headers: {
        origin, "access-control-request-method": method, "access-control-request-headers": "content-type",
      } });
      assert.equal(response.headers["access-control-allow-origin"], allowed ? origin : undefined);
      if (allowed) {
        assert.equal(response.statusCode, 204);
        assert.match(String(response.headers["access-control-allow-methods"]), new RegExp(method));
        assert.match(String(response.headers["access-control-allow-headers"]), /content-type/i);
      }
    }
  }
  // CORS controls browser access, not authorization for direct API clients.
  assert.equal((await app.inject("/health")).statusCode, 200);
});

test("production without an origin allowlist fails closed for cross-origin requests", async t => {
  const previousMode = process.env.NODE_ENV, previousOrigins = process.env.CORS_ORIGINS;
  process.env.NODE_ENV = "production";
  delete process.env.CORS_ORIGINS;
  t.after(() => {
    if (previousMode === undefined) delete process.env.NODE_ENV; else process.env.NODE_ENV = previousMode;
    if (previousOrigins === undefined) delete process.env.CORS_ORIGINS; else process.env.CORS_ORIGINS = previousOrigins;
  });
  const app = buildApp({ query: async () => ({ rows: [] }) });
  t.after(() => app.close());
  const response = await app.inject({ url: "/health", headers: { origin: "https://unconfigured.example" } });
  assert.equal(response.statusCode, 200);
  assert.equal(response.headers["access-control-allow-origin"], undefined);
  for (const corsOrigins of ["*", "https://demo.example/path", "https://user:password@demo.example", "null"]) {
    assert.throws(() => buildApp(unusedDatabase, new Map(), { corsOrigins }));
  }
});

test("16 KiB body limit and 200-character names reject oversized input before database work", async t => {
  const app = buildApp(unusedDatabase);
  t.after(() => app.close());
  const input = { name: "Demo", country: "Demo", latitude: 0, longitude: 0 };
  for (const url of ["/capital", "/capital-reset"]) {
    const response = await app.inject({ method: "POST", url, payload: { ...input, name: "x".repeat(20_000) } });
    assert.equal(response.statusCode, 413);
    assert.doesNotMatch(response.body, /stack|password|SQL/);
  }
  const response = await app.inject({ method: "POST", url: "/capital", payload: { ...input, name: "x".repeat(201) } });
  assert.equal(response.statusCode, 400);
});

test("shared write/reset budgets cannot be bypassed with forwarded headers; reads stay available", async t => {
  t.mock.timers.enable({ apis: ["Date"] });
  const app = buildApp({ query: async sql => { assert.equal(sql, "select 1"); return { rows: [] }; } }, new Map(), { publicDemo: true });
  t.after(() => app.close());
  for (let i = 0; i < 60; i++) {
    const method = (["POST", "PUT", "DELETE"] as const)[i % 3];
    const response = await app.inject({ method, url: method === "POST" ? "/capital" : "/capital/0",
      ...(method !== "DELETE" ? { payload: {} } : {}),
      headers: { "x-forwarded-for": `198.51.100.${i}`, forwarded: `for=198.51.100.${i}` },
    });
    assert.equal(response.statusCode, 400);
  }
  const limited = await app.inject({ method: "POST", url: "/capital", payload: {}, headers: { "x-forwarded-for": "203.0.113.99" } });
  assert.equal(limited.statusCode, 429);
  assert.match(limited.json().error, /wait a minute/);
  assert.ok(Number(limited.headers["retry-after"]) > 0);
  for (let i = 0; i < 3; i++) {
    assert.equal((await app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: false } })).statusCode, 400);
  }
  assert.equal((await app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: false } })).statusCode, 429);
  assert.equal((await app.inject("/health")).statusCode, 200);
  t.mock.timers.tick(60_001);
  assert.equal((await app.inject({ method: "POST", url: "/capital", payload: {} })).statusCode, 400);
});

test("a valid 200-character Unicode name remains accessible through the encoded lookup endpoint", async t => {
  const capital = { id: 1, name: "🌍".repeat(200), country: "Demo", latitude: 0, longitude: 0 };
  const app = buildApp({ query: async () => ({ rows: [capital] }) });
  t.after(() => app.close());
  assert.equal((await app.inject({ method: "POST", url: "/capital", payload: {
    name: capital.name, country: capital.country, latitude: 0, longitude: 0,
  } })).statusCode, 201);
  const response = await app.inject(`/capital/${encodeURIComponent(capital.name)}`);
  assert.equal(response.statusCode, 200);
  assert.equal(response.json().name, capital.name);
});
