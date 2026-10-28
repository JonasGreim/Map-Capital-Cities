import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { initializeDatabase } from "../src/initialize-database.js";

function database({ complete = false, fail = "" } = {}) {
  const queries: string[] = [];
  let destroyed: boolean | undefined;
  const db = { connect: async () => ({
    query: async (query: string | { text: string }) => {
      const sql = typeof query === "string" ? query : query.text;
      queries.push(sql);
      if (fail && sql.trim().startsWith(fail)) throw new Error("private database details");
      if (sql.includes("FROM pg_tables")) return { rows: [{ present: complete }] };
      if (sql.startsWith("SELECT 1 FROM import_state")) return { rowCount: complete ? 1 : 0 };
      if (sql.includes("AS present")) return { rows: [{ present: false }] };
      if (sql.includes('AS "countryKey"')) return { rows: [{ countryKey: "germany", flagCode: "DE", continents: ["Europe"], population: 0, currencies: null }] };
      return { rows: [], rowCount: 1 };
    },
    release: (error: boolean) => { destroyed = error; },
  }) } as unknown as Pick<Pool, "connect">;
  return { db, queries, destroyed: () => destroyed };
}
const fetcher: typeof fetch = async () => Response.json({ data: { objects: [
  { names: { common: "Germany" }, capitals: [{ name: "Berlin", coordinates: { lat: 1, lng: 2 } }] },
] } });

test("completed startup needs no key, network, transaction or schema writes", async () => {
  const mock = database({ complete: true });
  const result = await initializeDatabase(mock.db, undefined, async () => { throw new Error("Network must not be called"); });
  assert.equal(result.mode, "loaded");
  assert.equal(result.metadata.get("germany")?.population, 0);
  assert.equal(mock.queries.length, 3);
  assert.equal(mock.destroyed(), false);
});

test("a missing key rolls back initialization and never fetches", async () => {
  const mock = database();
  await assert.rejects(initializeDatabase(mock.db, undefined, async () => { assert.fail("No fetch without a key"); }), /RESTCOUNTRIES_API_KEY is required/);
  assert.equal(mock.queries.at(-1), "ROLLBACK");
  assert.equal(mock.destroyed(), true);
});

test("metadata, marker and commit failures roll back and suppress private DB errors", async () => {
  for (const fail of ["INSERT INTO country_metadata", "INSERT INTO import_state", "COMMIT"]) {
    const mock = database({ fail });
    await assert.rejects(initializeDatabase(mock.db, "test", fetcher), { message: "PostgreSQL initialization could not be confirmed (check database permissions and schema)" });
    assert.equal(mock.queries.at(-1), "ROLLBACK");
    assert.equal(mock.destroyed(), true);
  }
});

test("connection failure does not expose private connection details", async () => {
  const db = { connect: async () => { throw new Error("private connection URI"); } } as unknown as Pick<Pool, "connect">;
  await assert.rejects(initializeDatabase(db, "test", fetcher), { message: "PostgreSQL initialization connection failed" });
});
