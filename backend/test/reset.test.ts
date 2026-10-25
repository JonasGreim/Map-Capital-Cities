import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { defaultCapitals, defaultVersion, validateDefaults } from "../src/default-capitals.js";
import type { CapitalDatabase } from "../src/capitals.js";

const berlin = { id: 500, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };

function fixture(failAt?: string) {
  const calls: string[] = [];
  let released: boolean | undefined;
  const client: CapitalDatabase & { release(error?: boolean): void } = {
    query: async (sql) => {
      calls.push(sql);
      if (sql === failAt) throw new Error("private SQL connection information");
      return { rows: sql.startsWith("SELECT") ? [berlin] : [] };
    },
    release: (failed) => { released = failed; },
  };
  const database = { query: client.query, connect: async () => client };
  return { app: buildApp(database, new Map([["germany", { flagCode: "DE", continents: ["Europe"] }]])), database, client, calls, released: () => released };
}

test("reviewed default-v1 has 248 unique valid capitals; invalid snapshots fail closed", () => {
  assert.equal(defaultVersion, "default-v1");
  assert.equal(defaultCapitals.length, 248);
  const valid = { name: "City", country: "Country", latitude: 0, longitude: 0 };
  assert.deepEqual(validateDefaults([valid]), [valid]);
  for (const rows of [null, [], [null], [{ ...valid, id: 1 }], [{ ...valid, name: " " }],
    [{ ...valid, country: "bad\0" }], [{ ...valid, latitude: 91 }], [{ ...valid, longitude: Infinity }],
    [valid, { ...valid, name: "CITY", country: "Other" }], [valid, { ...valid, name: "Other" }]]) {
    assert.throws(() => validateDefaults(rows), /Invalid default/);
  }
});

test("public POST reset requires explicit confirmation and rejects invalid requests before SQL", async (t) => {
  const { app, calls } = fixture();
  t.after(() => app.close());
  for (const payload of [undefined, {}, { confirm: false }, { confirm: "true" }, { confirm: true, extra: 1 }, null, []]) {
    assert.equal((await app.inject({ method: "POST", url: "/capital-reset",
      ...(payload === undefined ? {} : { headers: { "content-type": "application/json" }, payload: JSON.stringify(payload) }),
    })).statusCode, 400);
  }
  assert.equal((await app.inject({ method: "POST", url: "/capital-reset", headers: { "content-type": "application/json" }, payload: "{" })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/capital-reset", headers: { "content-type": "text/plain" }, payload: "confirm" })).statusCode, 415);
  assert.equal(calls.length, 0);
});

test("reset succeeds without auth and returns confirmed capitals with existing flag enrichment", async (t) => {
  const { app, calls, released } = fixture();
  t.after(() => app.close());
  const response = await app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: true } });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.json(), [{ ...berlin, flagCode: "DE", continents: ["Europe"] }]);
  assert.ok(calls.indexOf("BEGIN") < calls.indexOf("DELETE FROM capitals"));
  assert.equal(calls.at(-1), "COMMIT");
  assert.equal(released(), false);
});

test("DB failures roll back and release the transaction; later requests can run", async (t) => {
  const { app, calls, released } = fixture("DELETE FROM capitals");
  t.after(() => app.close());
  for (let attempt = 0; attempt < 2; attempt++) {
    const response = await app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: true } });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: "Unable to reset capitals" });
  }
  assert.equal(calls.filter(sql => sql === "ROLLBACK").length, 2);
  assert.equal(calls.includes("COMMIT"), false);
  assert.equal(released(), true);
});

test("connection and commit failures return safe errors without success", async (t) => {
  for (const failure of ["connect", "COMMIT"]) {
    const f = fixture(failure);
    if (failure === "connect") f.database.connect = async () => { throw new Error("private credentials"); };
    t.after(() => f.app.close());
    const response = await f.app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: true } });
    assert.equal(response.statusCode, 500);
    assert.deepEqual(response.json(), { error: "Unable to reset capitals" });
    if (failure === "COMMIT") assert.equal(f.calls.at(-1), "ROLLBACK");
  }
});

test("overlapping reset requests are rejected; explicit later resets remain supported", async (t) => {
  const f = fixture();
  const original = f.client.query;
  let release!: () => void;
  const gate = new Promise<void>(resolve => { release = resolve; });
  let entered!: () => void;
  const started = new Promise<void>(resolve => { entered = resolve; });
  f.client.query = async (sql, values) => {
    if (sql === "DELETE FROM capitals") { entered(); await gate; }
    return original(sql, values);
  };
  t.after(() => { release(); return f.app.close(); });
  const pending = f.app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: true } }).then(response => response);
  await started;
  assert.equal((await f.app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: true } })).statusCode, 409);
  release();
  assert.equal((await pending).statusCode, 200);
  assert.equal((await f.app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: true } })).statusCode, 200);
  assert.equal(f.calls.filter(sql => sql === "DELETE FROM capitals").length, 2);
});
