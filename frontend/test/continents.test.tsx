import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CapitalActions } from "../src/CapitalActions";
import { CapitalList, filterCapitals } from "../src/CapitalList";
import type { Capital } from "../src/api";
import { matchesContinent, type ContinentFilter } from "../src/continent-filter";
import { useCapitalStore } from "../src/capital-store";

const berlin: Capital = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, continents: ["Europe"] };
const tokyo: Capital = { id: 2, name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.69, continents: ["Asia"] };
const ankara: Capital = { id: 3, name: "Ankara", country: "Turkey", latitude: 39.93, longitude: 32.86, continents: ["Asia", "Europe"] };
const unknown: Capital = { id: 4, name: "Unknown", country: "Unknown", latitude: 0, longitude: 0 };
const capitals = [berlin, tokyo, ankara, unknown];
afterEach(() => useCapitalStore.setState(useCapitalStore.getInitialState(), true));

test("search and continent matrix derives independent sidebar and map results without mutating data", () => {
  const snapshot = structuredClone(capitals);
  for (const [continent, search, sidebar, markers] of [
    ["", "", [1, 2, 3, 4], [1, 2, 3, 4]], ["", "  BERLIN  ", [1], [1, 2, 3, 4]],
    ["Europe", "", [1, 3], [1, 3]], ["Europe", "Berlin", [1], [1, 3]],
    ["Europe", "Tokyo", [], [1, 3]], ["Asia", " Tokyo ", [2], [2, 3]],
    ["Europe", "GERMANY", [1], [1, 3]], ["North America", "", [], []],
  ] as [ContinentFilter, string, number[], number[]][]) {
    assert.deepEqual(filterCapitals(capitals, search, continent).map(c => c.id), sidebar);
    assert.deepEqual(capitals.filter(c => matchesContinent(c, continent)).map(c => c.id), markers);
  }
  assert.deepEqual(capitals, snapshot);
});

test("continent selection retains canonical data and clears only an excluded selection", () => {
  useCapitalStore.setState({ capitals });
  const { selectCapital, setContinent } = useCapitalStore.getState();
  selectCapital(berlin.id);
  setContinent("Europe");
  assert.equal(useCapitalStore.getState().selectedCapitalId, berlin.id);
  setContinent("Asia");
  assert.equal(useCapitalStore.getState().selectedCapitalId, null);
  selectCapital(berlin.id);
  assert.equal(useCapitalStore.getState().selectedCapitalId, null);
  selectCapital(ankara.id);
  setContinent("Europe");
  assert.equal(useCapitalStore.getState().selectedCapitalId, ankara.id);
  assert.equal(useCapitalStore.getState().capitals, capitals);
});

test("known and unknown creates, country edits, deletion, reload and reset reconcile an active filter", async (t) => {
  useCapitalStore.setState({ capitals: [berlin], continent: "Europe", selectedCapitalId: berlin.id });
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json(tokyo));
  await useCapitalStore.getState().saveCapital(tokyo);
  assert.deepEqual(useCapitalStore.getState().capitals.map(c => c.id), [1, 2]);
  assert.equal(useCapitalStore.getState().selectedCapitalId, berlin.id);
  mock.mock.mockImplementation(async () => Response.json(unknown));
  await useCapitalStore.getState().saveCapital(unknown);
  assert.equal(filterCapitals(useCapitalStore.getState().capitals, "", "Europe").length, 1);
  mock.mock.mockImplementation(async () => Response.json({ ...berlin, country: "Japan", continents: ["Asia"] }));
  await useCapitalStore.getState().saveCapital({ ...berlin, country: "Japan" }, berlin.id);
  assert.equal(useCapitalStore.getState().selectedCapitalId, null);
  assert.equal(useCapitalStore.getState().capitals.length, 3);
  mock.mock.mockImplementation(async () => new Response(null, { status: 204 }));
  await useCapitalStore.getState().removeCapital(tokyo.id);
  assert.equal(useCapitalStore.getState().capitals.length, 2);
  mock.mock.mockImplementation(async () => Response.json([berlin, tokyo]));
  await useCapitalStore.getState().resetCapitals();
  assert.equal(useCapitalStore.getState().continent, "Europe");
  assert.equal(useCapitalStore.getState().selectedCapitalId, null);
  assert.deepEqual(filterCapitals(useCapitalStore.getState().capitals, "", "Europe"), [berlin]);
  useCapitalStore.getState().selectCapital(berlin.id);
  mock.mock.mockImplementation(async () => Response.json([{ ...berlin, continents: null }]));
  await useCapitalStore.getState().fetchCapitals();
  assert.equal(useCapitalStore.getState().selectedCapitalId, null);
});

test("labeled combobox defaults to all continents with honest total and matching counts", () => {
  const html = renderToStaticMarkup(<CapitalActions><CapitalList capitals={capitals} loading={false} error={null} onRetry={async () => {}} /></CapitalActions>);
  assert.match(html, /role="combobox" aria-labelledby="continent-label"/);
  assert.match(html, /aria-expanded="false"/);
  assert.match(html, /All continents/);
  assert.match(html, /4 of 4 capitals/);
  assert.match(html, /aria-label="4 capitals"/);
});
