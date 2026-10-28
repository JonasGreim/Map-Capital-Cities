import assert from "node:assert/strict";
import { test } from "node:test";
import { createCapital, getCapitals, resetCapitals, updateCapital } from "../src/api";

const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
const metadata = { flagCode: "cz", continents: [" europe ", "ASIA", "Europe"], population: 0, currencies: [{ code: "JPY" }] };
const normalized = { flagCode: "CZ", continents: ["Asia", "Europe"], population: 0, currencies: [{ code: "JPY" }] };

test("optional metadata is normalized or ignored without discarding valid capitals", async t => {
  const cases = [
    [{}, {}],
    [metadata, normalized],
    [{ flagCode: "DE", continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] },
      { flagCode: "DE", continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] }],
    ...[null, "../de", 12, {}, "DEU"].map(flagCode => [{ flagCode }, { flagCode: null }]),
    ...[null, [], "Europe", [null], ["Europe", "Atlantis"], [42]].map(continents => [{ continents }, { continents: null }]),
    [{ population: "42", currencies: { EUR: {} } }, { population: null, currencies: null }],
    [{ population: -1, currencies: [null, { code: "bad" }] }, { population: null, currencies: null }],
  ];
  t.mock.method(globalThis, "fetch", async () => Response.json(cases.map(([input]) => ({ ...berlin, ...input }))));
  assert.deepEqual(await getCapitals(), cases.map(([, expected]) => ({ ...berlin, ...expected })));
});

test("list/create/update/reset decode metadata while writes send only capital input fields", async t => {
  const row = { ...berlin, ...metadata };
  const fetcher = t.mock.method(globalThis, "fetch", async (url: unknown, options?: RequestInit) => {
    return Response.json(!options?.method || url === "/capital-reset" ? [row] : row);
  });
  const expected = { ...berlin, ...normalized };
  assert.deepEqual(await getCapitals(), [expected]);
  assert.deepEqual(await createCapital(row), expected);
  assert.deepEqual(await updateCapital(1, row), expected);
  assert.deepEqual(await resetCapitals(), [expected]);
  for (const call of fetcher.mock.calls.slice(1, 3)) {
    assert.deepEqual(JSON.parse(String(call.arguments[1]?.body)), {
      name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405,
    });
  }
  assert.equal(fetcher.mock.callCount(), 4);
});
