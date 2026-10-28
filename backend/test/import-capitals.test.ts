import assert from "node:assert/strict";
import { test } from "node:test";
import { ImportError, fetchCapitalData, countryMetadata } from "../src/import-capitals.js";
import { readPopulation, readCurrencies } from "../src/country-facts.js";

function country(name = "Berlin", common = "Germany", lat: unknown = 52.52, lng: unknown = 13.405) {
  return { names: { common }, capitals: [{ name, coordinates: { lat, lng } }] };
}

function page(objects: unknown[], offset: number, total: number) {
  return { data: { objects, meta: { total, count: objects.length, limit: 100, offset, more: offset + objects.length < total } } };
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

test("country facts accept only safe nonnegative integer populations, including zero", () => {
  for (const value of [0, 845000, 83200000, Number.MAX_SAFE_INTEGER]) assert.equal(readPopulation(value), value);
  for (const value of [undefined, null, "123", true, {}, NaN, Infinity, -Infinity, -1, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(readPopulation(value), null, String(value));
  }
});

test("v5 currency lists retain valid codes/names, deduplicate and suppress contradictory names", () => {
  assert.deepEqual(readCurrencies([{ code: "CAD", name: "Canadian dollar", symbol: "$" }]), [{ code: "CAD", name: "Canadian dollar" }]);
  assert.deepEqual(readCurrencies([
    { code: "USD", name: " US dollar " }, { code: "EUR", name: "Euro" }, { code: "USD", name: "US dollar" },
    { code: "JPY" }, { code: "GBP", name: "" }, { code: "CHF", name: "bad\nname" },
    { code: "NZD", name: "<img src=x onerror=alert(1)>" }, { code: "AUD", name: "hidden\u202ename" },
    null, [], "EUR", { code: "eur" }, { code: "US\n" }, { code: "EUR\n" }, { code: "<x>" }, { code: "" }, { name: "Euro" },
    { code: "CAD", name: "First" }, { code: "CAD", name: "Second" }, { code: "CAD", name: "First" },
  ]), [{ code: "AUD" }, { code: "CHF" }, { code: "EUR", name: "Euro" }, { code: "GBP" }, { code: "JPY" }, { code: "NZD" }, { code: "USD", name: "US dollar" }]);
  for (const value of [undefined, null, {}, { EUR: { name: "Euro" } }, "EUR", [], [null, { code: "" }]]) {
    assert.equal(readCurrencies(value), null);
  }
});

test("all facts validate independently and conflicts stay unknown across pages", async () => {
  const currencies = [{ code: "EUR", name: "Euro" }, { code: "USD" }];
  const record = { ...country(), codes: { alpha_2: "DE" }, continents: ["Europe"], population: 83200000, currencies };
  const objects = [record,
    { ...record, names: { common: "Zero" }, population: 0 },
    { ...record, names: { common: "Bad population" }, population: "83200000" },
    { ...record, names: { common: "Bad currency" }, currencies: {} },
    { ...record, names: { common: "Bad flag" }, codes: {} },
    { ...record, names: { common: "Bad continent" }, continents: ["Invalid"] },
  ];
  const { metadata } = await fetchCapitalData("test", responses(
    page(objects, 0, objects.length + 4),
    page([{ ...record, currencies: [...currencies].reverse() },
      { ...record, names: { common: "Conflicting" } }], objects.length, objects.length + 4),
    page([{ ...record, names: { common: "conflicting" }, population: 42, currencies: [{ code: "JPY" }] },
      { ...record, names: { common: "CONFLICTING" } }], objects.length + 2, objects.length + 4),
  ));
  const valid = { flagCode: "DE", continents: ["Europe"], population: 83200000, currencies };
  assert.deepEqual(countryMetadata(metadata, " GERMANY "), valid);
  assert.deepEqual(countryMetadata(metadata, "Zero"), { ...valid, population: 0 });
  assert.deepEqual(countryMetadata(metadata, "Bad population"), { ...valid, population: null });
  assert.deepEqual(countryMetadata(metadata, "Bad currency"), { ...valid, currencies: null });
  assert.deepEqual(countryMetadata(metadata, "Bad flag"), { ...valid, flagCode: null });
  assert.deepEqual(countryMetadata(metadata, "Bad continent"), { ...valid, continents: null });
  assert.deepEqual(countryMetadata(metadata, "Conflicting"), { ...valid, population: null, currencies: null });
  assert.deepEqual(countryMetadata(metadata, "Unknown"), { flagCode: null, continents: null, population: null, currencies: null });
});

test("fetches every page, maps only the first capital and sends v5 bearer authentication", async () => {
  const records = Array.from({ length: 100 }, (_, i) => country(`City ${i}`, `Country ${i}`));
  const second = country("  Ottawa  ", "  Canada  ", 0, -180);
  second.capitals.push({ name: "Ignored", coordinates: { lat: 1, lng: 1 } });
  const fetcher = responses(page(records, 0, 101), page([second], 100, 101));
  const offsets: string[] = [];
  const requests: { url: URL; init?: RequestInit }[] = [];
  const { metadata, capitals, stats } = await fetchCapitalData("test-key", async (input, init) => {
    requests.push({ url: new URL(String(input)), init });
    return fetcher(input, init);
  });
  for (const { url, init } of requests) {
    assert.equal(url.origin + url.pathname, "https://api.restcountries.com/countries/v5");
    assert.equal(url.searchParams.get("limit"), "100");
    offsets.push(url.searchParams.get("offset")!);
    assert.equal(new Headers(init?.headers).get("Authorization"), "Bearer test-key");
    assert.ok(init?.signal);
    assert.equal(init?.redirect, "error");
  }
  assert.deepEqual(offsets, ["0", "100"]);
  assert.equal(metadata.size, 101);
  assert.deepEqual(stats, { pages: 2, fetched: 101, skippedInvalid: 0, skippedExisting: 0, inserted: 0 });
  assert.equal(capitals.length, 101);
  assert.deepEqual(capitals.at(-1), { name: "Ottawa", latitude: 0, longitude: -180, country: "Canada" });
});

test("terminates on empty/short pages without metadata, including an exact multiple", async () => {
  for (const objects of [[], [country()], Array.from({ length: 100 }, () => country())]) {
    let calls = 0;
    const { stats } = await fetchCapitalData("test", async () => {
      calls++;
      return Response.json({ data: { objects: calls === 1 ? objects : [] } });
    });
    assert.equal(calls, objects.length === 100 ? 2 : 1);
    assert.equal(stats.fetched, objects.length);
  }
});

test("metadata can continue a short page and stops an exact full final page", async () => {
  const { stats } = await fetchCapitalData("test", responses(
    page([country()], 0, 2), page([country("Ottawa", "Canada")], 1, 2),
  ));
  assert.equal(stats.pages, 2);
  const full = Array.from({ length: 100 }, () => country());
  assert.equal((await fetchCapitalData("test", responses(page(full, 0, 100)))).stats.pages, 1);
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
  const { stats, capitals } = await fetchCapitalData("test", responses(page([...invalid, country("Valid", "Country", -90, 180)], 0, invalid.length + 1)));
  assert.equal(stats.skippedInvalid, invalid.length);
  assert.deepEqual(capitals, [{ name: "Valid", latitude: -90, longitude: 180, country: "Country" }]);
});

test("HTTP, network, JSON and envelope errors fail explicitly without exposing private details", async () => {
  for (const body of [new Response("denied", { status: 401 }), new Response("limit", { status: 429 }),
    new Error("network error with sensitive upstream details"), new DOMException("Timeout", "TimeoutError"),
    new Response("not json"), {}, { data: { objects: null } }, { data: { objects: [] }, errors: [] },
    { data: { objects: [], _demo: {} } }]) {
    await assert.rejects(fetchCapitalData("test", responses(body)), (error: unknown) => {
      assert.ok(error instanceof ImportError);
      assert.match(error.message, /offset 0/);
      assert.doesNotMatch(error.message, /sensitive/);
      assert.equal(error.stats.inserted, 0);
      return true;
    });
  }
});

test("a failed later page rejects the incomplete import with progress counts", async () => {
  await assert.rejects(fetchCapitalData("test", responses(
    page([country()], 0, 2), new Response("unavailable", { status: 503 }),
  )), (error: unknown) => {
    assert.ok(error instanceof ImportError);
    assert.match(error.message, /HTTP 503 at offset 1/);
    assert.deepEqual(error.stats, { pages: 1, fetched: 1, skippedInvalid: 0, skippedExisting: 0, inserted: 0 });
    return true;
  });
});

test("rejects inconsistent, stalled, changing and repeated pagination", async () => {
  const badPages = [
    { ...page([], 0, 2) },
    { data: { objects: [country()], meta: { total: 2, count: 1, limit: 100, offset: 0, more: false } } },
    { data: { objects: [country()], meta: { total: -1, count: 1, limit: 100, offset: 0, more: true } } },
    { data: { objects: [], meta: {} } },
  ];
  for (const body of badPages) await assert.rejects(fetchCapitalData("test", responses(body)), ImportError);
  for (const second of [page([country()], 1, 3), page([country("Other", "Other")], 1, 4),
    { data: { objects: [] } }, page([country("Other", "Other")], 0, 3)]) {
    await assert.rejects(fetchCapitalData("test", responses(page([country()], 0, 3), second)), ImportError);
  }
});

test("bounds pagination even if every page claims more data", async () => {
  let calls = 0;
  await assert.rejects(fetchCapitalData("test", async () => {
    const offset = calls++;
    return Response.json(page([country(`City ${offset}`, `Country ${offset}`)], offset, 1_000));
  }), /exceeded 100 pages/);
  assert.equal(calls, 100);
});

test("missing API key fails before any request", async () => {
  for (const key of [undefined, "", "   "]) {
    await assert.rejects(fetchCapitalData(key, responses()), /RESTCOUNTRIES_API_KEY is required/);
  }
});

test("flag metadata spans all pages and includes countries without capitals", async () => {
  const germany = { ...country(), codes: { alpha_2: "DE" } };
  const czechia = { ...country("Prague", " Czechia "), codes: { alpha_2: "CZ" } };
  const territory = { names: { common: "Antarctica" }, codes: { alpha_2: "AQ" }, capitals: [] };
  const result = await fetchCapitalData("test", responses(
    page([germany], 0, 3), page([czechia, territory], 1, 3),
  ));
  assert.equal(result.capitals.length, 2);
  assert.equal(result.stats.skippedInvalid, 1);
  for (const [country, code] of [[" GERMANY ", "DE"], ["czechia", "CZ"], ["Antarctica", "AQ"]]) {
    assert.equal(countryMetadata(result.metadata, country).flagCode, code);
  }
  assert.equal(countryMetadata(result.metadata, "Deutschland").flagCode, null);
  assert.equal(countryMetadata(result.metadata, "Unknown").flagCode, null);
});

test("flag metadata validates exact codes and names and permanently suppresses ambiguous names", async () => {
  const record = (common: unknown, alpha_2: unknown) => ({ names: { common }, codes: { alpha_2 } });
  const objects = [record(" Same ", "DE"), record("SAME", "CZ"), record("same", "DE"),
    record("Repeated", "FR"), record("repeated", "FR"),
    ...[undefined, null, 42, "", "de", " DE ", "DE\n", "DEU", "D1", "../de", "DÉ"].map((code, i) => record(`Invalid ${i}`, code)),
    record(" ", "DE"), record(null, "DE"), record(12, "DE"), record("Bad\0name", "DE"),
    record("Incomplete", "DE"), record("incomplete", null), record("incomplete", "DE"),
    { names: { common: "No codes" } }, null];
  const { metadata } = await fetchCapitalData("test", responses(page(objects, 0, objects.length)));
  assert.equal(countryMetadata(metadata, "same").flagCode, null);
  assert.equal(countryMetadata(metadata, "Repeated").flagCode, "FR");
  assert.equal(countryMetadata(metadata, "Incomplete").flagCode, null);
  assert.equal([...metadata.values()].filter(value => value.flagCode !== null).length, 1);
  assert.equal(metadata.has("bad\0name"), false);
});

test("continent metadata validates and normalizes all pages independently of valid capitals and flags", async () => {
  const records = [
    { ...country(), codes: { alpha_2: "DE" }, continents: [" europe ", "EUROPE"], population: null, currencies: null },
    { names: { common: "Antarctica" }, capitals: [], continents: ["Antarctica"], population: null, currencies: null },
    { ...country("Ankara", "Turkey"), continents: ["Europe", "Asia"], population: null, currencies: null },
    { names: { common: " TURKEY " }, continents: [" asia ", "Europe", "Asia"], population: null, currencies: null },
    ...[undefined, null, [], "Europe", [null], [42], [""], ["Atlantis"], ["Europe", "Atlantis"]]
      .map((continents, i) => ({ names: { common: `Invalid ${i}` }, continents })),
    { names: { common: "Contradictory" }, continents: ["Europe"], population: null, currencies: null },
    { names: { common: "contradictory" }, continents: ["Asia"], population: null, currencies: null },
    { names: { common: "CONTRADICTORY" }, continents: ["Europe"], population: null, currencies: null },
    { names: { common: "Missing later" }, continents: ["Europe"], population: null, currencies: null },
    { names: { common: "Missing later" } },
    { names: { common: "Missing later" }, continents: ["Europe"], population: null, currencies: null },
  ];
  const result = await fetchCapitalData("test", responses(
    page(records.slice(0, 3), 0, records.length), page(records.slice(3), 3, records.length),
  ));
  assert.deepEqual(countryMetadata(result.metadata, " GERMANY "), { flagCode: "DE", continents: ["Europe"], population: null, currencies: null });
  assert.deepEqual(countryMetadata(result.metadata, "Turkey").continents, ["Asia", "Europe"]);
  assert.deepEqual(countryMetadata(result.metadata, "Antarctica").continents, ["Antarctica"]);
  for (const name of ["Unknown", "Contradictory", "Missing later", ...Array.from({ length: 9 }, (_, i) => `Invalid ${i}`)]) {
    assert.equal(countryMetadata(result.metadata, name).continents, null);
  }
});
