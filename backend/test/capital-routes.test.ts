import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import type { Capital, CapitalDatabase } from "../src/capitals.js";

const input = { name: "Berlin", latitude: 52.52, longitude: 13.405, country: "Germany" };
const capital = { id: 7, ...input };

function fixture(rows: Capital[] = [capital], failure?: Error) {
  const queries: { sql: string; values?: unknown[] }[] = [];
  const database: CapitalDatabase = { query: async (sql, values) => {
    queries.push({ sql, values });
    if (failure) throw failure;
    return { rows };
  } };
  return { app: buildApp(database), queries };
}

test("GET /capital returns a plain array, including an empty database", async (t) => {
  for (const rows of [[capital], []]) {
    const { app, queries } = fixture(rows);
    t.after(() => app.close());
    const response = await app.inject({ method: "GET", url: "/capital" });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), rows);
    assert.equal(queries.length, 1);
  }
});

test("GET by name passes the literal name to a case-insensitive parameterized lookup", async (t) => {
  const { app, queries } = fixture();
  t.after(() => app.close());
  for (const name of ["bErLiN", "O'City; DROP TABLE capitals;--"]) {
    const response = await app.inject({ method: "GET", url: `/capital/${encodeURIComponent(name)}` });
    assert.equal(response.statusCode, 200);
    assert.deepEqual(response.json(), capital);
    assert.deepEqual(queries.at(-1)?.values, [name]);
    assert.match(queries.at(-1)!.sql, /lower\(name\) = lower\(\$1\)/);
    assert.equal(queries.at(-1)!.sql.includes(name), false);
  }
});

test("POST generates its ID in SQL, trims text and returns the created object with 201", async (t) => {
  const { app, queries } = fixture();
  t.after(() => app.close());
  const response = await app.inject({ method: "POST", url: "/capital", payload: { ...input, name: " Berlin ", country: " Germany " } });
  assert.equal(response.statusCode, 201);
  assert.deepEqual(response.json(), capital);
  assert.deepEqual(queries[0].values, ["Berlin", 52.52, 13.405, "Germany"]);
  assert.match(queries[0].sql, /^INSERT INTO capitals \(name, latitude, longitude, country\)/);
});

test("PUT performs a complete update and returns the object with 200", async (t) => {
  const { app, queries } = fixture();
  t.after(() => app.close());
  const response = await app.inject({ method: "PUT", url: "/capital/7", payload: input });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), capital);
  assert.deepEqual(queries[0].values, ["Berlin", 52.52, 13.405, "Germany", 7]);
  assert.match(queries[0].sql, /WHERE id = \$5 RETURNING/);
});

test("DELETE returns 204 with no body and uses the numeric ID parameter", async (t) => {
  const { app, queries } = fixture();
  t.after(() => app.close());
  const response = await app.inject({ method: "DELETE", url: "/capital/7" });
  assert.equal(response.statusCode, 204);
  assert.equal(response.body, "");
  assert.deepEqual(queries[0].values, [7]);
});

test("missing names and IDs return a consistent 404", async (t) => {
  const { app } = fixture([]);
  t.after(() => app.close());
  for (const request of [
    { method: "GET", url: "/capital/Missing" },
    { method: "PUT", url: "/capital/2147483647", payload: input },
    { method: "DELETE", url: "/capital/2147483647" },
  ] as const) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, 404);
    assert.deepEqual(response.json(), { error: "Capital not found" });
  }
});

test("POST and PUT reject missing fields, wrong types, blank/NUL text, extra fields and invalid coordinates before SQL", async (t) => {
  const { app, queries } = fixture();
  t.after(() => app.close());
  const invalid: unknown[] = [null, [], "text", {}, { ...input, id: 1 }, { ...input, extra: true },
    { ...input, name: " \t\n" }, { ...input, name: "City\0" }, { ...input, name: 123 },
    { ...input, country: " " }, { ...input, country: "Country\0" }, { ...input, country: false },
    { ...input, latitude: 90.001 }, { ...input, latitude: -90.001 },
    { ...input, longitude: 180.001 }, { ...input, longitude: -180.001 },
    { ...input, latitude: "52.52" }, { ...input, longitude: false }, { ...input, latitude: null },
    { ...input, latitude: Infinity }, { ...input, longitude: NaN }];
  for (const key of Object.keys(input)) {
    const missing = { ...input } as Record<string, unknown>;
    delete missing[key];
    invalid.push(missing);
  }
  for (const method of ["POST", "PUT"] as const) {
    for (const payload of invalid) {
      const response = await app.inject({ method, url: method === "POST" ? "/capital" : "/capital/7",
        headers: { "content-type": "application/json" }, payload: JSON.stringify(payload) });
      assert.equal(response.statusCode, 400, `${method} ${JSON.stringify(payload)}`);
      assert.deepEqual(response.json(), { error: "Invalid request data" });
    }
    const missingBody = await app.inject({ method, url: method === "POST" ? "/capital" : "/capital/7" });
    assert.equal(missingBody.statusCode, 400);
  }
  assert.equal(queries.length, 0);
});

test("coordinate boundary values are accepted without type coercion", async (t) => {
  const { app } = fixture();
  t.after(() => app.close());
  for (const [latitude, longitude] of [[90, -180], [-90, 180], [0, 0]]) {
    const response = await app.inject({ method: "POST", url: "/capital", payload: { ...input, latitude, longitude } });
    assert.equal(response.statusCode, 201);
  }
});

test("PUT and DELETE reject IDs outside the positive PostgreSQL integer range before SQL", async (t) => {
  const { app, queries } = fixture();
  t.after(() => app.close());
  for (const method of ["PUT", "DELETE"] as const) {
    for (const id of ["0", "-1", "1.5", "1e2", "+1", "01", "nope", "2147483648", "9007199254740992", "1 OR 1=1"]) {
      const response = await app.inject({ method, url: `/capital/${encodeURIComponent(id)}`,
        ...(method === "PUT" ? { payload: input } : {}) });
      assert.equal(response.statusCode, 400, `${method} ${id}`);
      assert.deepEqual(response.json(), { error: "Invalid request data" });
    }
  }
  assert.equal(queries.length, 0);
});

test("invalid lookup names, malformed JSON and unsupported media types return safe errors", async (t) => {
  const { app, queries } = fixture();
  t.after(() => app.close());
  for (const name of [" ", "\t", "City\0"]) {
    const response = await app.inject({ method: "GET", url: `/capital/${encodeURIComponent(name)}` });
    assert.equal(response.statusCode, 400);
    assert.deepEqual(response.json(), { error: "Invalid request data" });
  }
  for (const method of ["POST", "PUT"] as const) {
    const url = method === "POST" ? "/capital" : "/capital/7";
    const malformed = await app.inject({ method, url, headers: { "content-type": "application/json" }, payload: "{broken" });
    assert.equal(malformed.statusCode, 400);
    assert.deepEqual(malformed.json(), { error: "Invalid request data" });
    const text = await app.inject({ method, url, headers: { "content-type": "text/plain" }, payload: "text" });
    assert.equal(text.statusCode, 415);
    assert.deepEqual(text.json(), { error: "Content-Type must be application/json" });
  }
  assert.equal(queries.length, 0);
});

test("name and country uniqueness errors map to 409 for both POST and PUT", async (t) => {
  for (const constraint of ["capitals_name_unique", "capitals_country_key"]) {
    const { app } = fixture([], Object.assign(new Error(`duplicate key SQL details: ${constraint}`), { code: "23505", constraint }));
    t.after(() => app.close());
    for (const method of ["POST", "PUT"] as const) {
      const response = await app.inject({ method, url: method === "POST" ? "/capital" : "/capital/7", payload: input });
      assert.equal(response.statusCode, 409);
      assert.deepEqual(response.json(), { error: "Capital name or country already exists" });
    }
  }
});

test("unexpected database failures produce safe 500 responses for every endpoint", async (t) => {
  const { app } = fixture([], new Error("SQL details and postgres://user:secret@host/db"));
  t.after(() => app.close());
  for (const request of [
    { method: "GET", url: "/capital" }, { method: "GET", url: "/capital/Berlin" },
    { method: "POST", url: "/capital", payload: input }, { method: "PUT", url: "/capital/7", payload: input },
    { method: "DELETE", url: "/capital/7" },
  ] as const) {
    const response = await app.inject(request);
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: "Internal server error" });
    assert.doesNotMatch(response.body, /secret|postgres|SQL|stack/);
  }
});
