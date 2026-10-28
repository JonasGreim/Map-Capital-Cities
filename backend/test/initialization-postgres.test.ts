import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { test } from "node:test";
import pg from "pg";
import { initializeDatabase } from "../src/initialize-database.js";
import { countryMetadata } from "../src/import-capitals.js";
import { buildApp } from "../src/app.js";
import { defaultCapitals } from "../src/default-capitals.js";
import { waitForDatabase } from "../src/db.js";

const record = (name: string, common: string) => ({ names: { common }, capitals: [{ name, coordinates: { lat: 1, lng: 2 } }] });
const germany = { ...record("Berlin", " Germany "), codes: { alpha_2: "DE" }, continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] };
const data = [germany, { ...record("Ottawa", "Canada"), codes: { alpha_2: "CA" },
  continents: ["North America"], population: Number.MAX_SAFE_INTEGER, currencies: [{ code: "CAD" }] },
  { names: { common: " Antarctica " }, capitals: [], codes: { alpha_2: "AQ" }, continents: ["Antarctica"], population: 0, currencies: null },
  { names: { common: "No facts" }, capitals: [] },
];
function paginated() {
  let requests = 0;
  const fetcher: typeof fetch = async (input, init) => {
    requests++;
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer mock-key");
    const offset = Number(new URL(String(input)).searchParams.get("offset"));
    const objects = data.slice(offset, offset + 2);
    return Response.json({ data: { objects, meta: { offset, limit: 100, total: data.length, count: objects.length, more: offset + objects.length < data.length } } });
  };
  return { fetcher, requests: () => requests };
}
const unavailable: typeof fetch = async () => { assert.fail("Completed database must never call REST Countries"); };

test("PostgreSQL seed-once initialization, migration, recovery and concurrency", {
  skip: process.env.TEST_DATABASE_URL ? false : "Set TEST_DATABASE_URL to a disposable PostgreSQL database",
}, async (t) => {
  assert.notEqual(process.env.TEST_DATABASE_URL, process.env.DATABASE_URL, "Use an isolated disposable database");
  const admin = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const cleanup: (() => Promise<void>)[] = [];
  t.after(async () => {
    for (const close of cleanup) await close();
    await admin.end();
  });
  await waitForDatabase(admin);
  async function isolated() {
    const schema = `init_${randomUUID().replaceAll("-", "")}`;
    await admin.query(`CREATE SCHEMA ${schema}`);
    const makePool = (queryTimeout = 5_000) => new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL, options: `-c search_path=${schema}`, query_timeout: queryTimeout });
    const db = makePool();
    cleanup.push(async () => {
      await db.end();
      await admin.query(`DROP SCHEMA ${schema} CASCADE`);
    });
    return { db, makePool };
  }

  await t.test("fresh schema, all metadata and marker commit together; another backend boot loads the same API facts", async () => {
    const { db, makePool } = await isolated();
    const mock = paginated();
    const first = await initializeDatabase(db, "mock-key", mock.fetcher);
    assert.equal(first.mode, "seeded");
    assert.equal(mock.requests(), 2);
    assert.equal(first.stats?.inserted, 2);
    assert.equal((await db.query("SELECT * FROM country_metadata")).rowCount, 4);
    assert.equal((await db.query("SELECT * FROM import_state WHERE source = 'rest-countries-v5' AND completed_at IS NOT NULL")).rowCount, 1);
    const restarted = makePool();
    try {
      const second = await initializeDatabase(restarted, undefined, unavailable);
      assert.equal(second.mode, "loaded");
      assert.deepEqual(second.metadata, first.metadata);
      assert.equal(mock.requests(), 2);
      assert.deepEqual(countryMetadata(second.metadata, " ANTARCTICA "), { flagCode: "AQ", continents: ["Antarctica"], population: 0, currencies: null });
      assert.deepEqual(countryMetadata(second.metadata, "Unknown"), { flagCode: null, continents: null, population: null, currencies: null });
      const app = buildApp(restarted, second.metadata);
      try {
        const response = await app.inject({ method: "GET", url: "/capital/Berlin" });
        assert.equal(response.statusCode, 200);
        assert.deepEqual(response.json(), { id: response.json().id, name: "Berlin", country: "Germany", latitude: 1, longitude: 2,
          flagCode: "DE", continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] });
      } finally { await app.close(); }
    } finally { await restarted.end(); }
  });

  await t.test("CRUD edits/deletes/creates and deliberately empty capitals survive restart", async () => {
    const { db } = await isolated();
    const { metadata } = await initializeDatabase(db, "mock-key", paginated().fetcher);
    const app = buildApp(db, metadata);
    try {
      const berlin = (await db.query("SELECT id FROM capitals WHERE name = 'Berlin'")).rows[0];
      assert.equal((await app.inject({ method: "PUT", url: `/capital/${berlin.id}`, payload: { name: "My capital", country: "My country", latitude: 42, longitude: 43 } })).statusCode, 200);
      const ottawa = (await db.query("SELECT id FROM capitals WHERE name = 'Ottawa'")).rows[0];
      assert.equal((await app.inject({ method: "DELETE", url: `/capital/${ottawa.id}` })).statusCode, 204);
      assert.equal((await app.inject({ method: "POST", url: "/capital", payload: { name: "Manual", country: "Manual", latitude: 0, longitude: 0 } })).statusCode, 201);
      const before = (await db.query("SELECT * FROM capitals ORDER BY id")).rows;
      await initializeDatabase(db, undefined, unavailable);
      assert.deepEqual((await db.query("SELECT * FROM capitals ORDER BY id")).rows, before);
      await db.query("DELETE FROM capitals");
      await initializeDatabase(db, undefined, unavailable);
      assert.equal((await db.query("SELECT * FROM capitals")).rowCount, 0);
    } finally { await app.close(); }
  });

  await t.test("legacy migration preserves every existing row and ID without resurrecting absent capitals", async () => {
    const { db } = await isolated();
    const sql = await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8");
    await db.query(sql.split("CREATE TABLE IF NOT EXISTS country_metadata")[0]);
    await db.query("INSERT INTO capitals (name, country, latitude, longitude) VALUES ('Local Berlin', 'Germany', 42, 43), ('Custom', 'Custom', 0, 0)");
    const before = (await db.query("SELECT * FROM capitals ORDER BY id")).rows;
    const first = await initializeDatabase(db, "mock-key", paginated().fetcher);
    assert.equal(first.mode, "backfilled");
    assert.equal(first.stats?.inserted, 0);
    assert.deepEqual((await db.query("SELECT * FROM capitals ORDER BY id")).rows, before);
    assert.equal((await db.query("SELECT * FROM country_metadata")).rowCount, 4);
    await initializeDatabase(db, undefined, unavailable);
    assert.deepEqual((await db.query("SELECT * FROM capitals ORDER BY id")).rows, before);
  });

  await t.test("failed later API page rolls back fresh schema and can be retried", async () => {
    const { db } = await isolated();
    let requests = 0;
    const good = paginated();
    await assert.rejects(initializeDatabase(db, "mock-key", async (...args) => {
      if (++requests === 2) return new Response(null, { status: 503 });
      return good.fetcher(...args);
    }), /HTTP 503/);
    assert.equal((await db.query("SELECT to_regclass('import_state') AS state, to_regclass('capitals') AS capitals")).rows[0].state, null);
    assert.equal((await db.query("SELECT to_regclass('capitals') AS capitals")).rows[0].capitals, null);
    assert.equal((await initializeDatabase(db, "mock-key", paginated().fetcher)).mode, "seeded");
  });

  await t.test("capital, metadata and marker write failures roll back all data, keep legacy rows and permit retry", async () => {
    for (const target of ["capitals", "country_metadata", "import_state"]) {
      const { db } = await isolated();
      await db.query(await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8"));
      if (target !== "capitals") await db.query("INSERT INTO capitals (name, country, latitude, longitude) VALUES ('Existing', 'Existing', 0, 0)");
      const before = (await db.query("SELECT * FROM capitals ORDER BY id")).rows;
      await db.query(`ALTER TABLE ${target} ADD CONSTRAINT import_test_failure CHECK (false) NOT VALID`);
      await assert.rejects(initializeDatabase(db, "mock-key", paginated().fetcher), /no successful commit/);
      assert.deepEqual((await db.query("SELECT * FROM capitals ORDER BY id")).rows, before);
      assert.equal((await db.query("SELECT * FROM country_metadata")).rowCount, 0);
      assert.equal((await db.query("SELECT * FROM import_state")).rowCount, 0);
      await db.query(`ALTER TABLE ${target} DROP CONSTRAINT import_test_failure`);
      await initializeDatabase(db, "mock-key", paginated().fetcher);
    }
  });

  await t.test("empty or wholly invalid response cannot permanently complete initialization", async () => {
    const { db } = await isolated();
    for (const objects of [[], [{}]]) await assert.rejects(initializeDatabase(db, "mock-key", async () => Response.json({ data: { objects } })), /no valid capitals/);
    assert.equal((await db.query("SELECT to_regclass('import_state') AS state")).rows[0].state, null);
    await initializeDatabase(db, "mock-key", paginated().fetcher);
  });

  await t.test("concurrent initializers serialize even beyond normal query timeout, fetch once and observe committed metadata", async () => {
    const { db, makePool } = await isolated();
    const mock = paginated();
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = initializeDatabase(db, "mock-key", async (...args) => {
      started();
      await gate;
      return mock.fetcher(...args);
    });
    await entered;
    // The contender's normal timeout is deliberately much shorter than the gate.
    const shortTimeout = makePool(50);
    try {
      const second = initializeDatabase(shortTimeout, undefined, unavailable);
      await new Promise(resolve => setTimeout(resolve, 150));
      release();
      const [a, b] = await Promise.all([first, second]);
      assert.equal(a.mode, "seeded");
      assert.equal(b.mode, "loaded");
      assert.deepEqual(b.metadata, a.metadata);
      assert.equal(mock.requests(), 2);
      assert.equal((await db.query("SELECT * FROM import_state")).rowCount, 1);
    } finally { release(); await shortTimeout.end(); }
  });

  await t.test("a waiting initializer retries successfully after the first initializer rolls back", async () => {
    const { db, makePool } = await isolated();
    const contender = makePool();
    let release!: () => void;
    let started!: () => void;
    const entered = new Promise<void>(resolve => { started = resolve; });
    const gate = new Promise<void>(resolve => { release = resolve; });
    const first = assert.rejects(initializeDatabase(db, "mock-key", async () => {
      started();
      await gate;
      return new Response(null, { status: 503 });
    }), /HTTP 503/);
    await entered;
    const mock = paginated();
    try {
      const second = initializeDatabase(contender, "mock-key", mock.fetcher);
      release();
      await first;
      assert.equal((await second).mode, "seeded");
      assert.equal(mock.requests(), 2);
      assert.equal((await db.query("SELECT * FROM import_state")).rowCount, 1);
      assert.equal((await db.query("SELECT * FROM capitals")).rowCount, 2);
    } finally { release(); await contender.end(); }
  });

  await t.test("reset restores unchanged defaults while metadata and marker remain byte-for-byte stable across another boot", async () => {
    const { db } = await isolated();
    const { metadata } = await initializeDatabase(db, "mock-key", paginated().fetcher);
    const before = (await db.query("SELECT * FROM country_metadata ORDER BY country_key")).rows;
    const state = (await db.query("SELECT * FROM import_state")).rows;
    const app = buildApp(db, metadata);
    try {
      const result = await app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: true } });
      assert.equal(result.statusCode, 200);
      assert.equal(result.json().length, defaultCapitals.length);
      assert.equal(result.json().find((capital: { name: string }) => capital.name === "Berlin").flagCode, "DE");
      assert.deepEqual((await db.query("SELECT * FROM country_metadata ORDER BY country_key")).rows, before);
      assert.deepEqual((await db.query("SELECT * FROM import_state")).rows, state);
      await initializeDatabase(db, undefined, unavailable);
      assert.equal((await db.query("SELECT * FROM capitals")).rowCount, defaultCapitals.length);
    } finally { await app.close(); }
  });
});
