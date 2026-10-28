import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { buildApp } from "../src/app.js";
import type { LightMyRequestResponse } from "fastify";
import { importCapitals } from "../src/import-capitals.js";
import { waitForDatabase } from "../src/db.js";
import type { Capital } from "../src/capitals.js";

// Explicit opt-in only; never fall back to the developer's DATABASE_URL.
test("PostgreSQL schema, constraints, atomic import, CRUD API and health", {
  skip: process.env.TEST_DATABASE_URL ? false : "Set TEST_DATABASE_URL to a disposable PostgreSQL database",
}, async (t) => {
  const schema = `issue_2_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  t.after(async () => {
    await db.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  });
  await waitForDatabase(admin);
  await admin.query(`CREATE SCHEMA ${schema}`);
  const sql = await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8");
  await db.query(sql);
  await db.query(sql); // Safe manual initialization for an existing pre-issue volume.
  const insert = "INSERT INTO capitals (name, latitude, longitude, country) VALUES ($1, $2, $3, $4) RETURNING *";

  await t.test("generated integer IDs, required fields, bounds and uniqueness", async () => {
    const { rows: [first] } = await db.query(insert, ["Berlin", -90, 180, "Germany"]);
    assert.ok(Number.isInteger(first.id));
    for (const values of [
      [null, 0, 0, "Country"], ["City", null, 0, "Country"], ["City", 0, null, "Country"], ["City", 0, 0, null],
      [" ", 0, 0, "Country"], ["\t\n", 0, 0, "Country"], ["City", 0, 0, "\t"],
      ["City", 91, 0, "Country"], ["City", -91, 0, "Country"], ["City", 0, 181, "Country"], ["City", 0, -181, "Country"],
      ["City", "NaN", 0, "Country"], ["City", "Infinity", 0, "Country"], ["City", 0, "-Infinity", "Country"],
      ["berLIN", 0, 0, "Other"], ["Other", 0, 0, "Germany"],
    ]) await assert.rejects(db.query(insert, values), (error: unknown) => {
      assert.ok(error instanceof pg.DatabaseError);
      assert.ok(["23502", "23505", "23514"].includes(error.code!));
      return true;
    });
    await assert.rejects(db.query("INSERT INTO capitals (id, name, latitude, longitude, country) VALUES (99, 'Manual', 0, 0, 'Manual')"),
      { code: "428C9" });
    await assert.rejects(db.query("INSERT INTO capitals (id, name, latitude, longitude, country) OVERRIDING SYSTEM VALUE VALUES ($1, 'Duplicate ID', 0, 0, 'Duplicate ID')", [first.id]),
      { code: "23505" });
    await db.query(insert, ["Boundary", 90, -180, "Boundary"]);
  });

  const record = (name: string, common: string) => ({ names: { common }, capitals: [{ name, coordinates: { lat: 1, lng: 2 } }] });
  const importedName = "Ottawa'; DROP TABLE capitals;--";
  const fetcher: typeof fetch = async (input) => {
    const offset = Number(new URL(String(input)).searchParams.get("offset"));
    return Response.json({ data: {
      objects: offset === 0 ? [record("Berlin", "Germany")] : [record(importedName, "Canada")],
      meta: { total: 2, count: 1, limit: 100, offset, more: offset === 0 },
    } });
  };
  await t.test("multi-page import is idempotent, preserves edits and can restore deletes", async () => {
    const first = await importCapitals(db, "mock-key", fetcher);
    assert.equal(first.inserted, 1);
    assert.equal(first.skippedExisting, 1);
    assert.equal((await db.query("SELECT name FROM capitals WHERE country = 'Canada'")).rows[0].name, importedName);
    await db.query("UPDATE capitals SET name = 'Local Ottawa', latitude = 42 WHERE country = 'Canada'");
    assert.equal((await importCapitals(db, "mock-key", fetcher)).inserted, 0);
    const { rows: [edited] } = await db.query("SELECT name, latitude FROM capitals WHERE country = 'Canada'");
    assert.deepEqual(edited, { name: "Local Ottawa", latitude: 42 });
    await db.query("DELETE FROM capitals WHERE country = 'Canada'");
    assert.equal((await importCapitals(db, "mock-key", fetcher)).inserted, 1);
    const caseConflict = await importCapitals(db, "mock-key", async () => Response.json({ data: { objects: [record("BERLIN", "Different")] } }));
    assert.equal(caseConflict.skippedExisting, 1);
  });

  await t.test("a later insert failure rolls back earlier inserts", async () => {
    await db.query("ALTER TABLE capitals ADD CONSTRAINT test_failure CHECK (name <> 'Fail')");
    await assert.rejects(importCapitals(db, "mock-key", async () => Response.json({ data: {
      objects: [record("Before failure", "New country"), record("Fail", "Fail country")],
    } })), /transaction failed/);
    assert.equal((await db.query("SELECT * FROM capitals WHERE country = 'New country'")).rowCount, 0);
    await db.query("ALTER TABLE capitals DROP CONSTRAINT test_failure");
  });

  await t.test("existing health contract uses the real database", async () => {
    const app = buildApp(db);
    try {
      const response = await app.inject({ method: "GET", url: "/health" });
      assert.equal(response.statusCode, 200);
      assert.deepEqual(response.json(), { ok: true });
    } finally { await app.close(); }
  });

  await t.test("CRUD HTTP contract uses real PostgreSQL and enforces unique keys on create/update", async () => {
    const app = buildApp(db);
    try {
      const name = "Test City's; DROP TABLE capitals;--";
      const input = { name: ` ${name} `, latitude: -90, longitude: 180, country: " API Test Country " };
      const created = await app.inject({ method: "POST", url: "/capital", payload: input });
      assert.equal(created.statusCode, 201);
      const capital = created.json<Capital>();
      assert.ok(Number.isInteger(capital.id));
      assert.deepEqual(capital, { ...input, id: capital.id, name, country: "API Test Country", flagCode: null, continents: null, population: null, currencies: null });

      const lookup = await app.inject({ method: "GET", url: `/capital/${encodeURIComponent(name.toUpperCase())}` });
      assert.equal(lookup.statusCode, 200);
      assert.deepEqual(lookup.json(), capital);
      const list = await app.inject({ method: "GET", url: "/capital" });
      assert.equal(list.statusCode, 200);
      assert.ok(Array.isArray(list.json()));
      assert.ok(list.json().some((row: { id: number }) => row.id === capital.id));

      for (const method of ["POST", "PUT"] as const) {
        for (const payload of [
          { ...input, name: "bErLiN", country: "Different Country" },
          { ...input, name: "Different City", country: "Germany" },
        ]) {
          const response: LightMyRequestResponse = await app.inject({ method, url: method === "POST" ? "/capital" : `/capital/${capital.id}`, payload });
          assert.equal(response.statusCode, 409);
          assert.deepEqual(response.json(), { error: "Capital name or country already exists" });
        }
      }
      assert.deepEqual((await db.query("SELECT * FROM capitals WHERE id = $1", [capital.id])).rows[0], { id: capital.id, ...input, name, country: "API Test Country" });

      const replacement = { name: "Updated City", latitude: 90, longitude: -180, country: "Updated Country" };
      const updated = await app.inject({ method: "PUT", url: `/capital/${capital.id}`, payload: replacement });
      assert.equal(updated.statusCode, 200);
      assert.deepEqual(updated.json(), { id: capital.id, ...replacement, flagCode: null, continents: null, population: null, currencies: null });
      assert.equal((await app.inject({ method: "GET", url: `/capital/${encodeURIComponent(name)}` })).statusCode, 404);

      assert.deepEqual((await db.query("SELECT * FROM capitals WHERE id = $1", [capital.id])).rows[0], { id: capital.id, ...replacement });

      const deleted = await app.inject({ method: "DELETE", url: `/capital/${capital.id}` });
      assert.equal(deleted.statusCode, 204);
      assert.equal(deleted.body, "");
      assert.equal((await db.query("SELECT * FROM capitals WHERE id = $1", [capital.id])).rowCount, 0);
      assert.equal((await app.inject({ method: "GET", url: `/capital/${encodeURIComponent(replacement.name)}` })).statusCode, 404);
    } finally { await app.close(); }
  });

  await t.test("import metadata decorates preserved rows and manual CRUD without storing country facts", async () => {
    const before = (await db.query("SELECT * FROM capitals ORDER BY id")).rows;
    const { metadata } = await importCapitals(db, "mock-key", async () => Response.json({ data: { objects: [
      { ...record("Berlin", "Germany"), codes: { alpha_2: "DE" }, continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] },
      { names: { common: "Czechia" }, codes: { alpha_2: "CZ" }, continents: ["Europe"], population: 10800000, currencies: [{ code: "CZK", name: "Czech koruna" }], capitals: [] },
      { names: { common: "Antarctica" }, codes: { alpha_2: "AQ" }, continents: ["Antarctica"], population: 0, currencies: null, capitals: [] },
    ] } }));
    assert.deepEqual((await db.query("SELECT * FROM capitals ORDER BY id")).rows, before);
    const app = buildApp(db, metadata);
    try {
      const list = await app.inject({ method: "GET", url: "/capital" });
      assert.equal(list.statusCode, 200);
      assert.deepEqual(list.json().find((row: Capital) => row.name === "Berlin"), {
        ...before.find(row => row.name === "Berlin"), flagCode: "DE", continents: ["Europe"],
        population: 83200000, currencies: [{ code: "EUR", name: "Euro" }],
      });
      assert.equal((await app.inject({ method: "GET", url: "/capital/Berlin" })).json().flagCode, "DE");
      const input = { name: "Manual capital", country: "Czechia", latitude: 10, longitude: 20 };
      const created = await app.inject({ method: "POST", url: "/capital", payload: input });
      assert.equal(created.statusCode, 201);
      const capital = created.json<Capital>();
      assert.deepEqual(created.json(), { ...input, id: capital.id, flagCode: "CZ", continents: ["Europe"], population: 10800000, currencies: [{ code: "CZK", name: "Czech koruna" }] });
      for (const [country, flagCode] of [["Antarctica", "AQ"], ["Unknown", null]] as const) {
        const updated = await app.inject({ method: "PUT", url: `/capital/${capital.id}`, payload: { ...input, country } });
        assert.equal(updated.statusCode, 200);
        assert.deepEqual(updated.json(), { ...input, country, id: capital.id, flagCode, continents: country === "Antarctica" ? ["Antarctica"] : null, population: country === "Antarctica" ? 0 : null, currencies: null });
        assert.deepEqual((await db.query("SELECT * FROM capitals WHERE id = $1", [capital.id])).rows[0], { ...input, country, id: capital.id });
      }
      assert.equal((await app.inject({ method: "DELETE", url: `/capital/${capital.id}` })).statusCode, 204);
    } finally { await app.close(); }
  });
});
