import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { mockStorage } from "./storage-fixture";
import { markerColors } from "../src/marker-colors";
import { clearMarkerColors, markerColorStorageKey as key, readMarkerColor, removeMarkerColor, saveMarkerColor } from "../src/marker-color-storage";
import { useCapitalStore } from "../src/capital-store";

const [teal, red, purple, gold] = markerColors.map(color => color.value);
const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
afterEach(() => useCapitalStore.setState(useCapitalStore.getInitialState(), true));

test("palette overrides persist independently; Teal and removal keep other colors and foreign keys", t => {
  const { values } = mockStorage(t);
  values.set("foreign", "keep");
  saveMarkerColor(1, red); saveMarkerColor(15, purple); saveMarkerColor(28, gold);
  assert.deepEqual(JSON.parse(values.get(key)!), { 1: red, 15: purple, 28: gold });
  saveMarkerColor(1, gold);
  assert.equal(readMarkerColor(15), purple);
  saveMarkerColor(1, teal);
  assert.deepEqual(JSON.parse(values.get(key)!), { 15: purple, 28: gold });
  removeMarkerColor(15);
  assert.equal(readMarkerColor(15), teal);
  assert.equal(readMarkerColor(28), gold);
  clearMarkerColors();
  assert.equal(values.has(key), false);
  assert.equal(values.get("foreign"), "keep");
});

test("malformed, obsolete and unsafe data are ignored; IDs must be canonical database integers", t => {
  const { values } = mockStorage(t);
  for (const raw of ["{", "null", "[]", '"red"', '{"version":0,"colors":{"1":"#b42318"}}']) {
    values.set(key, raw);
    assert.equal(readMarkerColor(1), teal);
  }
  values.set(key, JSON.stringify({ 1: red, 2: "red", 3: "<script>", 4: {}, 5: teal,
    "01": purple, "-1": gold, "1.5": gold, "2147483648": gold, "__proto__": gold }));
  for (const id of [0, -1, 1.5, NaN, Infinity, 2147483648, Number.MAX_SAFE_INTEGER]) {
    saveMarkerColor(id, red);
    assert.equal(readMarkerColor(id), teal);
  }
  for (const color of ["red", "#ffffff", "url(javascript:alert(1))"]) saveMarkerColor(1, color);
  assert.equal(readMarkerColor(1), red);
  saveMarkerColor(6, purple);
  assert.deepEqual(JSON.parse(values.get(key)!), { 1: red, 6: purple });
  saveMarkerColor(2147483647, gold);
  assert.equal(readMarkerColor(2147483647), gold);
});

test("missing storage, denied getter and read/write/remove failures never escape", t => {
  const { values, native } = mockStorage(t);
  saveMarkerColor(1, red);
  for (const method of ["getItem", "setItem", "removeItem"] as const) {
    const mock = t.mock.method(native, method, () => { throw new Error("denied"); });
    assert.doesNotThrow(() => { saveMarkerColor(2, purple); removeMarkerColor(1); clearMarkerColors(); });
    if (method === "getItem") assert.equal(readMarkerColor(1), teal);
    mock.mock.restore();
  }
  values.set(key, JSON.stringify({ 1: red }));
  t.mock.method(native, "getItem", () => { throw new Error("denied"); });
  saveMarkerColor(2, gold);
  assert.equal(values.get(key), JSON.stringify({ 1: red }), "failed read must not overwrite unknown colors");
  for (const descriptor of [{ value: undefined }, { get: () => { throw new Error("SecurityError"); } }]) {
    Object.defineProperty(globalThis, "localStorage", { configurable: true, ...descriptor });
    assert.equal(readMarkerColor(1), teal);
    assert.doesNotThrow(() => { saveMarkerColor(1, red); removeMarkerColor(1); clearMarkerColors(); });
  }
});

test("confirmed create/delete clear their ID; edits and failed deletes preserve all colors", async t => {
  const { values } = mockStorage(t);
  useCapitalStore.setState({ capitals: [berlin] });
  saveMarkerColor(1, red); saveMarkerColor(2, purple);
  const fetch = t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) =>
    options?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json({ ...berlin, name: "Changed", country: "Changed country", latitude: 0 }));
  await useCapitalStore.getState().saveCapital(berlin, 1);
  assert.equal(readMarkerColor(1), red);
  fetch.mock.mockImplementation(async () => new Response(null, { status: 500 }));
  await assert.rejects(useCapitalStore.getState().removeCapital(1));
  assert.equal(readMarkerColor(1), red);
  fetch.mock.mockImplementation(async () => new Response(null, { status: 204 }));
  await useCapitalStore.getState().removeCapital(1);
  assert.deepEqual(JSON.parse(values.get(key)!), { 2: purple });
  saveMarkerColor(1, gold); // stale ID from a previously known record
  fetch.mock.mockImplementation(async () => Response.json(berlin));
  await useCapitalStore.getState().saveCapital(berlin);
  assert.equal(readMarkerColor(1), teal);
  assert.equal(readMarkerColor(2), purple);
});

test("reset clears only app colors after validated success, preserving colors on uncertain results", async t => {
  const { values } = mockStorage(t);
  values.set("foreign", "keep");
  saveMarkerColor(1, red); saveMarkerColor(2, purple);
  useCapitalStore.setState({ capitals: [berlin], selectedCapitalId: 1 });
  const fetch = t.mock.method(globalThis, "fetch", async () => Response.json([berlin]));
  for (const failure of ["http", "network", "invalid"]) {
    fetch.mock.mockImplementation(async () => {
      if (failure === "network") throw new Error("timeout");
      return failure === "http" ? new Response(null, { status: 500 }) : Response.json([]);
    });
    await assert.rejects(useCapitalStore.getState().resetCapitals());
    assert.deepEqual(JSON.parse(values.get(key)!), { 1: red, 2: purple });
    assert.equal(useCapitalStore.getState().resetVersion, 0);
  }
  fetch.mock.mockImplementation(async () => Response.json([berlin]));
  await useCapitalStore.getState().resetCapitals();
  assert.equal(values.has(key), false);
  assert.equal(readMarkerColor(1), teal, "fresh reads after reset must stay Teal even for reused IDs");
  assert.equal(values.get("foreign"), "keep");
  assert.equal(useCapitalStore.getState().selectedCapitalId, null);
});

test("storage failures cannot reject confirmed CRUD/reset results", async t => {
  const { native } = mockStorage(t);
  t.mock.method(native, "getItem", () => { throw new Error("denied"); });
  t.mock.method(native, "removeItem", () => { throw new Error("denied"); });
  t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) =>
    _url === "/capital-reset" ? Response.json([berlin]) : options?.method === "DELETE"
      ? new Response(null, { status: 204 }) : Response.json(berlin));
  await useCapitalStore.getState().saveCapital(berlin);
  await useCapitalStore.getState().removeCapital(1);
  await useCapitalStore.getState().resetCapitals();
  assert.deepEqual(useCapitalStore.getState().capitals, [berlin]);
  assert.equal(useCapitalStore.getState().mutating, false);
});
