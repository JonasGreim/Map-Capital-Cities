import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { buildApp } from "../src/app.js";
import { defaultCapitals } from "../src/default-capitals.js";
import { waitForDatabase } from "../src/db.js";
import type { Capital } from "../src/capitals.js";

// Explicit disposable database only; never fall back to DATABASE_URL.
test("PostgreSQL reset restores defaults atomically in an isolated schema", {
  skip: process.env.TEST_DATABASE_URL ? false : "Set TEST_DATABASE_URL to a disposable PostgreSQL database",
}, async (t) => {
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, "Reset tests must not use the development DB");
  const schema = `reset_${randomUUID().replaceAll("-", "")}`;
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const db = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}` });
  const app = buildApp(db, new Map([["germany", { flagCode: "DE", continents: ["Europe"] }]]));
  t.after(async () => {
    await app.close();
    await db.end();
    try { await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`); }
    finally { await admin.end(); }
  });
  await waitForDatabase(admin);
  await admin.query(`CREATE SCHEMA ${schema}`);
  await db.query(await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8"));
  const rows = async () => (await db.query<Capital>("SELECT * FROM capitals ORDER BY lower(name), id")).rows;
  const reset = () => app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: true } });
  const values = (capitals: readonly (Capital | typeof defaultCapitals[number])[]) => capitals.map(capital => ({
    name: capital.name, country: capital.country, latitude: capital.latitude, longitude: capital.longitude,
  })).sort((a, b) => a.country.localeCompare(b.country));

  await t.test("empty DB, edited/deleted defaults and manual conflicts are replaced with new IDs", async () => {
    assert.equal((await reset()).statusCode, 200);
    const original = await rows();
    assert.deepEqual(values(original), values(defaultCapitals));
    const berlin = original.find(row => row.name === "Berlin")!;
    const prague = original.find(row => row.name === "Prague")!;
    await db.query("UPDATE capitals SET name = 'Edited city', country = 'Edited country', latitude = 0, longitude = 0 WHERE id = $1", [berlin.id]);
    await db.query("DELETE FROM capitals WHERE id = $1", [prague.id]);
    const create = "INSERT INTO capitals (name, country, latitude, longitude) VALUES ($1, $2, 1, 2)";
    await db.query(create, ["BERLIN", "Manual country"]);
    await db.query(create, ["Manual capital", prague.country]);
    const before = await rows();
    const response = await reset();
    assert.equal(response.statusCode, 200);
    const restored = await rows();
    assert.deepEqual(values(restored), values(defaultCapitals));
    assert.ok(restored.every(row => row.id > Math.max(...before.map(capital => capital.id))));
    assert.equal(response.json<Capital[]>().find(row => row.name === "Berlin")!.latitude, berlin.latitude);
    assert.equal(response.json().find((row: Capital) => row.name === "Berlin").flagCode, "DE");
    assert.deepEqual(response.json().find((row: Capital) => row.name === "Berlin").continents, ["Europe"]);
    assert.equal(response.json().length, 248);
  });
  await t.test("an explicit repeat restores the same values without reusing IDs", async () => {
    const before = await rows();
    assert.equal((await reset()).statusCode, 200);
    const after = await rows();
    assert.deepEqual(values(after), values(before));
    assert.ok(after.every(row => !before.some(old => old.id === row.id)));
  });
  await t.test("insert failure after DELETE rolls back all original values and IDs", async () => {
    const before = await rows();
    await db.query("ALTER TABLE capitals ADD CONSTRAINT reset_test_failure CHECK (name <> 'Berlin') NOT VALID");
    try {
      const response = await reset();
      assert.equal(response.statusCode, 500);
      assert.deepEqual(response.json(), { error: "Unable to reset capitals" });
      assert.deepEqual(await rows(), before);
    } finally { await db.query("ALTER TABLE capitals DROP CONSTRAINT reset_test_failure"); }
  });
  await t.test("a concurrent writer times out reset without changing existing rows", async () => {
    const before = await rows();
    const blocker = await db.connect();
    try {
      await blocker.query("BEGIN");
      await blocker.query("LOCK TABLE capitals IN ROW EXCLUSIVE MODE");
      assert.equal((await reset()).statusCode, 500);
      assert.deepEqual(await rows(), before);
    } finally { await blocker.query("ROLLBACK"); blocker.release(); }
    assert.equal((await reset()).statusCode, 200);
  });
});
