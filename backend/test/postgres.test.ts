import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { importCapitals } from "../src/import-capitals.js";
import { waitForDatabase } from "../src/db.js";

// Explicit opt-in only; never fall back to the developer's DATABASE_URL.
test("PostgreSQL schema, constraints, atomic import, local edits and health", {
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
    await db.query(insert, ["Boundary", 90, -180, "Boundary"]);
  });

  const record = (name: string, common: string) => ({ names: { common }, capitals: [{ name, coordinates: { lat: 1, lng: 2 } }] });
  const fetcher: typeof fetch = async (input) => {
    const offset = Number(new URL(String(input)).searchParams.get("offset"));
    return Response.json({ data: {
      objects: offset === 0 ? [record("Berlin", "Germany")] : [record("Ottawa", "Canada")],
      meta: { total: 2, count: 1, limit: 100, offset, more: offset === 0 },
    } });
  };
  await t.test("multi-page import is idempotent, preserves edits and can restore deletes", async () => {
    const first = await importCapitals(db, "mock-key", fetcher);
    assert.equal(first.inserted, 1);
    assert.equal(first.skippedExisting, 1);
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
});
