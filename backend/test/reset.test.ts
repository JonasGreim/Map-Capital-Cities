import assert from "node:assert/strict";
import { test } from "node:test";
import { buildApp } from "../src/app.js";
import { defaultCapitals, defaultVersion, validateDefaults } from "../src/default-capitals.js";
import type { CapitalDatabase } from "../src/capitals.js";

const berlin = { id: 500, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };

function fixture(failAt?: string) {
  let queries = 0;
  let failNext = true;
  let released: boolean | undefined;
  const client: CapitalDatabase & { release(error?: boolean): void } = {
    query: async (sql) => {
      queries++;
      if (failNext && sql === failAt) {
        failNext = false;
        throw new Error("private SQL connection information");
      }
      return { rows: sql.startsWith("SELECT") ? [berlin] : [] };
    },
    release: (failed) => { released = failed; },
  };
  const database = { query: client.query, connect: async () => client };
  return { app: buildApp(database), database, client, queries: () => queries, released: () => released };
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
  const { app, queries } = fixture();
  t.after(() => app.close());
  for (const payload of [undefined, {}, { confirm: false }, { confirm: "true" }, { confirm: true, extra: 1 }, null, []]) {
    assert.equal((await app.inject({ method: "POST", url: "/capital-reset",
      ...(payload === undefined ? {} : { headers: { "content-type": "application/json" }, payload: JSON.stringify(payload) }),
    })).statusCode, 400);
  }
  assert.equal((await app.inject({ method: "POST", url: "/capital-reset", headers: { "content-type": "application/json" }, payload: "{" })).statusCode, 400);
  assert.equal((await app.inject({ method: "POST", url: "/capital-reset", headers: { "content-type": "text/plain" }, payload: "confirm" })).statusCode, 415);
  assert.equal(queries(), 0);
});

test("connection, write and uncertain commit failures return safe errors and allow a later reset", async (t) => {
  for (const failure of ["connect", "DELETE FROM capitals", "COMMIT"]) {
    const f = fixture(failure);
    t.after(() => f.app.close());
    const connect = f.database.connect;
    if (failure === "connect") f.database.connect = async () => { throw new Error("private credentials"); };
    const response = await f.app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: true } });
    assert.equal(response.statusCode, 500, failure);
    assert.deepEqual(response.json(), { error: "Unable to reset capitals" });
    if (failure !== "connect") assert.equal(f.released(), true, "Discard failed transaction clients");
    f.database.connect = connect;
    assert.equal((await f.app.inject({ method: "POST", url: "/capital-reset", payload: { confirm: true } })).statusCode, 200);
    assert.equal(f.released(), false);
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
});
