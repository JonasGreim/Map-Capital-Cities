import assert from "node:assert/strict";
import { test } from "node:test";
import { createCapital, getCapitals, resetCapitals, updateCapital } from "../src/api";
import { countryFacts, readPopulation, readCurrencies } from "../src/country-facts";

const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
const facts = { continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] };

test("country populations format consistently without rounding and missing facts use neutral text", () => {
  for (const [population, formatted] of [[0, "0"], [845000, "845,000"], [83200000, "83,200,000"],
    [1400000001, "1,400,000,001"], [Number.MAX_SAFE_INTEGER, "9,007,199,254,740,991"]] as const) {
    assert.equal(countryFacts({ population })[1][1], formatted);
  }
  for (const population of [undefined, null, NaN, Infinity, -1, 1.5, "123", true, {}, Number.MAX_SAFE_INTEGER + 1]) {
    assert.equal(readPopulation(population), null);
    assert.equal(countryFacts({ population })[1][1], "—");
  }
  assert.deepEqual(countryFacts({}), [["Continent", "—"], ["Country population", "—"], ["Currency", "—"]]);
  assert.deepEqual(countryFacts(facts), [["Continent", "Europe"], ["Country population", "83,200,000"], ["Currency", "Euro (EUR)"]]);
});

test("all continents/currencies are retained as text; long names, invalid entries and duplicates are safe", () => {
  const longName = "A long readable currency name ".repeat(8).trim();
  assert.equal(countryFacts({ continents: ["Europe", "Asia", "Europe"] })[0][1], "Asia, Europe");
  const currencies = [{ code: "USD", name: longName }, { code: "EUR", name: "Euro" }, { code: "JPY" },
    { code: "EUR", name: "Euro" }, { code: "NZD", name: "<img src=x onerror=alert(1)>" },
    { code: "CHF", name: "hidden\u202ename" }, { code: "GBP", name: "bad\nname" }, { code: "AUD", name: " " },
    null, [], { code: "usd" }, { code: "" }, { code: "EU\n" }, { code: "EUR\n" }, { code: "EURO" }, { name: "Euro" },
    { code: "CAD", name: "One" }, { code: "CAD", name: "Two" }, { code: "CAD", name: "One" }];
  assert.equal(countryFacts({ currencies })[2][1], `AUD, CHF, Euro (EUR), GBP, JPY, NZD, ${longName} (USD)`);
  for (const value of [undefined, null, [], "EUR", {}, { EUR: { name: "Euro" } }, [null, { code: 123 }]]) {
    assert.equal(readCurrencies(value), null);
    assert.equal(countryFacts({ currencies: value })[2][1], "—");
  }
});

test("list/create/update/reset normalize optional facts without changing required fields or mutation inputs", async t => {
  const mock = t.mock.method(globalThis, "fetch", (async () => Response.json([])) as typeof fetch);
  for (const metadata of [facts, { population: 0, currencies: [{ code: "JPY" }] },
    { population: "42", currencies: { EUR: {} } }, { population: -1, currencies: [null, { code: "bad" }] }, {}]) {
    const row = { ...berlin, ...metadata };
    mock.mock.mockImplementation(async () => Response.json([row]));
    for (const capital of [(await getCapitals())[0], (await resetCapitals())[0]]) {
      assert.equal(capital.name, berlin.name);
      assert.equal(capital.population ?? null, readPopulation(metadata.population));
      assert.deepEqual(capital.currencies ?? null, readCurrencies(metadata.currencies));
    }
    mock.mock.mockImplementation(async () => Response.json(row));
    for (const capital of [await createCapital({ ...berlin, ...facts }), await updateCapital(1, { ...berlin, ...facts })]) {
      assert.equal(capital.population ?? null, readPopulation(metadata.population));
      assert.deepEqual(capital.currencies ?? null, readCurrencies(metadata.currencies));
    }
    for (const call of mock.mock.calls.slice(-2)) {
      assert.deepEqual(Object.keys(JSON.parse(String(call.arguments[1]?.body))).sort(), ["country", "latitude", "longitude", "name"]);
    }
  }
  mock.mock.mockImplementation(async () => Response.json([{ ...berlin, latitude: "52.52", ...facts }]));
  await assert.rejects(getCapitals(), /invalid response/);
});
