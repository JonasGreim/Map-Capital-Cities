import assert from "node:assert/strict";
import { test } from "node:test";
import type { Pool } from "pg";
import { ImportError, importCapitals } from "../src/import-capitals.js";

function country(name = "Berlin", common = "Germany", lat: unknown = 52.52, lng: unknown = 13.405) {
  return { names: { common }, capitals: [{ name, coordinates: { lat, lng } }] };
}

function page(objects: unknown[], offset: number, total: number) {
  return { data: { objects, meta: { total, count: objects.length, limit: 100, offset, more: offset + objects.length < total } } };
}

function database({ failInsert = false, rowCount = 1 } = {}) {
  const queries: { sql: string; values?: unknown[] }[] = [];
  let connections = 0;
  let released = false;
  const db = { connect: async () => {
    connections++;
    return {
      query: async (sql: string, values?: unknown[]) => {
        queries.push({ sql, values });
        if (failInsert && sql.startsWith("INSERT")) throw new Error("DB failure");
        return { rowCount };
      },
      release: () => { released = true; },
    };
  } } as unknown as Pick<Pool, "connect">;
  return { db, queries, connections: () => connections, released: () => released };
}

function responses(...bodies: unknown[]): typeof fetch {
  let index = 0;
  return async () => {
    assert.ok(index < bodies.length, "Unexpected additional API request");
    const body = bodies[index++];
    if (body instanceof Error) throw body;
    return body instanceof Response ? body : Response.json(body);
  };
}

test("imports every metadata page, maps only the first capital and sends v5 bearer authentication", async () => {
  const db = database();
  const records = Array.from({ length: 100 }, (_, i) => country(`City ${i}`, `Country ${i}`));
  const second = country("  Ottawa  ", "  Canada  ", 0, -180);
  second.capitals.push({ name: "Ignored", coordinates: { lat: 1, lng: 1 } });
  const fetcher = responses(page(records, 0, 101), page([second], 100, 101));
  const offsets: string[] = [];
  const stats = await importCapitals(db.db, "test-key", async (input, init) => {
    const url = new URL(String(input));
    assert.equal(url.origin + url.pathname, "https://api.restcountries.com/countries/v5");
    assert.equal(url.searchParams.get("limit"), "100");
    offsets.push(url.searchParams.get("offset")!);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key");
    assert.ok(init?.signal);
    assert.equal(init?.redirect, "error");
    assert.equal(db.connections(), 0, "No transaction before all pages arrive");
    return fetcher(input, init);
  });
  assert.deepEqual(offsets, ["0", "100"]);
  assert.deepEqual(stats, { pages: 2, fetched: 101, skippedInvalid: 0, skippedExisting: 0, inserted: 101 });
  assert.deepEqual(db.queries.at(-2)?.values, ["Ottawa", 0, -180, "Canada"]);
  assert.equal(db.queries[0].sql, "BEGIN");
  assert.equal(db.queries.at(-1)?.sql, "COMMIT");
  assert.equal(db.released(), true);
});

test("terminates on empty/short pages without metadata, including an exact multiple", async () => {
  for (const objects of [[], [country()], Array.from({ length: 100 }, () => country())]) {
    let calls = 0;
    const stats = await importCapitals(database().db, "test", async () => {
      calls++;
      return Response.json({ data: { objects: calls === 1 ? objects : [] } });
    });
    assert.equal(calls, objects.length === 100 ? 2 : 1);
    assert.equal(stats.fetched, objects.length);
  }
});

test("metadata can continue a short page and stops an exact full final page", async () => {
  const stats = await importCapitals(database().db, "test", responses(
    page([country()], 0, 2), page([country("Ottawa", "Canada")], 1, 2),
  ));
  assert.equal(stats.pages, 2);
  const full = Array.from({ length: 100 }, () => country());
  assert.equal((await importCapitals(database().db, "test", responses(page(full, 0, 100)))).pages, 1);
});

test("skips missing/malformed capitals, names and coordinates without rejecting valid neighbours", async () => {
  const invalid = [null, {}, { names: { common: "Country" }, capitals: [] },
    { ...country(), capitals: [null] }, { ...country(), capitals: [{ name: "City" }] },
    { ...country(), capitals: "Berlin" }, { ...country(), names: { common: 3 } },
    country(" "), country("City", "\t"), country("City\0"),
    country("City", "Country", "52"), country("City", "Country", null),
    country("City", "Country", 91), country("City", "Country", -91),
    country("City", "Country", 1, 181), country("City", "Country", 1, -181),
    country("City", "Country", Infinity), country("City", "Country", 1, NaN)];
  const db = database();
  const stats = await importCapitals(db.db, "test", responses(page([...invalid, country("Valid", "Country", -90, 180)], 0, invalid.length + 1)));
  assert.equal(stats.skippedInvalid, invalid.length);
  assert.equal(stats.inserted, 1);
  assert.deepEqual(db.queries[1].values, ["Valid", -90, 180, "Country"]);
});

test("HTTP, network, JSON and envelope errors fail explicitly and never acquire a DB client", async () => {
  for (const body of [new Response("denied", { status: 401 }), new Response("limit", { status: 429 }),
    new Error("network error with sensitive upstream details"), new DOMException("Timeout", "TimeoutError"),
    new Response("not json"), {}, { data: { objects: null } }, { data: { objects: [] }, errors: [] },
    { data: { objects: [], _demo: {} } }]) {
    const db = database();
    await assert.rejects(importCapitals(db.db, "test", responses(body)), (error: unknown) => {
      assert.ok(error instanceof ImportError);
      assert.match(error.message, /offset 0/);
      assert.doesNotMatch(error.message, /sensitive/);
      assert.equal(error.stats.inserted, 0);
      return true;
    });
    assert.equal(db.connections(), 0);
  }
});

test("a failed later page is an incomplete import with progress counts and no writes", async () => {
  const db = database();
  await assert.rejects(importCapitals(db.db, "test", responses(
    page([country()], 0, 2), new Response("unavailable", { status: 503 }),
  )), (error: unknown) => {
    assert.ok(error instanceof ImportError);
    assert.match(error.message, /HTTP 503 at offset 1/);
    assert.deepEqual(error.stats, { pages: 1, fetched: 1, skippedInvalid: 0, skippedExisting: 0, inserted: 0 });
    return true;
  });
  assert.equal(db.connections(), 0);
});

test("rejects inconsistent, stalled, changing and repeated pagination", async () => {
  const badPages = [
    { ...page([], 0, 2) },
    { data: { objects: [country()], meta: { total: 2, count: 1, limit: 100, offset: 0, more: false } } },
    { data: { objects: [country()], meta: { total: -1, count: 1, limit: 100, offset: 0, more: true } } },
    { data: { objects: [], meta: {} } },
  ];
  for (const body of badPages) await assert.rejects(importCapitals(database().db, "test", responses(body)), ImportError);
  for (const second of [page([country()], 1, 3), page([country("Other", "Other")], 1, 4),
    { data: { objects: [] } }, page([country("Other", "Other")], 0, 3)]) {
    const db = database();
    await assert.rejects(importCapitals(db.db, "test", responses(page([country()], 0, 3), second)), ImportError);
    assert.equal(db.connections(), 0);
  }
});

test("bounds pagination even if every page claims more data", async () => {
  let calls = 0;
  const db = database();
  await assert.rejects(importCapitals(db.db, "test", async () => {
    const offset = calls++;
    return Response.json(page([country(`City ${offset}`, `Country ${offset}`)], offset, 1_000));
  }), /exceeded 100 pages/);
  assert.equal(calls, 100);
  assert.equal(db.connections(), 0);
});

test("uses parameterized conflict-safe inserts and reports existing records without updates", async () => {
  const db = database({ rowCount: 0 });
  const name = "O'City; DROP TABLE capitals;--";
  const stats = await importCapitals(db.db, "test", responses(page([country(name)], 0, 1)));
  assert.equal(stats.inserted, 0);
  assert.equal(stats.skippedExisting, 1);
  assert.match(db.queries[1].sql, /VALUES \(\$1, \$2, \$3, \$4\) ON CONFLICT DO NOTHING$/);
  assert.equal(db.queries[1].sql.includes(name), false);
  assert.equal(db.queries[1].values?.[0], name);
});

test("DB failures roll back, release the client and do not report committed inserts", async () => {
  const db = database({ failInsert: true });
  await assert.rejects(importCapitals(db.db, "test", responses(page([country()], 0, 1))), (error: unknown) => {
    assert.ok(error instanceof ImportError);
    assert.match(error.message, /transaction failed/);
    assert.equal(error.stats.inserted, 0);
    return true;
  });
  assert.equal(db.queries.at(-1)?.sql, "ROLLBACK");
  assert.equal(db.released(), true);
  await assert.rejects(importCapitals({ connect: async () => { throw new Error("DB unavailable"); } } as unknown as Pick<Pool, "connect">,
    "test", responses(page([], 0, 0))), /connection failed/);
});

test("missing API key fails before any request or write", async () => {
  for (const key of [undefined, "", "   "]) {
    const db = database();
    await assert.rejects(importCapitals(db.db, key, responses()), /RESTCOUNTRIES_API_KEY is required/);
    assert.equal(db.connections(), 0);
  }
});
