import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { useCapitalStore } from "../src/capital-store";
import { CapitalActions } from "../src/CapitalActions";
import { CapitalList } from "../src/CapitalList";

const prague = { id: 1, name: "Prague", country: "Czechia", latitude: 50.0755, longitude: 14.4378 };
const berlin = { id: 2, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
afterEach(() => useCapitalStore.setState({ capitals: [], selectedCapitalId: null, selectionVersion: 0, selectionSource: "list", loading: false, mutating: false, error: null }));

test("selection accepts existing capitals from list or map and repeated selection is an explicit new request", () => {
  useCapitalStore.setState({ capitals: [prague, berlin] });
  const { selectCapital } = useCapitalStore.getState();
  selectCapital(1);
  assert.equal(useCapitalStore.getState().selectedCapitalId, 1);
  const version = useCapitalStore.getState().selectionVersion;
  selectCapital(1);
  assert.equal(useCapitalStore.getState().selectionVersion, version + 1);
  selectCapital(2, "map");
  assert.equal(useCapitalStore.getState().selectedCapitalId, 2);
  assert.equal(useCapitalStore.getState().selectionSource, "map");
  selectCapital(999);
  assert.equal(useCapitalStore.getState().selectedCapitalId, 2);
  selectCapital(null, "map");
  assert.equal(useCapitalStore.getState().selectedCapitalId, null);
});

test("confirmed edits retain selection; failed deletes retain it; confirmed deletion and empty reload clear it", async (t) => {
  useCapitalStore.setState({ capitals: [prague, berlin], selectedCapitalId: 1 });
  const edited = { ...prague, name: "Updated Prague", latitude: 20 };
  const mock = t.mock.method(globalThis, "fetch", async () => Response.json(edited));
  await useCapitalStore.getState().saveCapital(edited, 1);
  assert.equal(useCapitalStore.getState().selectedCapitalId, 1);
  assert.equal(useCapitalStore.getState().capitals.find(capital => capital.id === 1)?.latitude, 20);
  mock.mock.mockImplementation(async () => new Response(null, { status: 409 }));
  await assert.rejects(useCapitalStore.getState().removeCapital(1));
  assert.equal(useCapitalStore.getState().selectedCapitalId, 1);
  mock.mock.mockImplementation(async () => new Response(null, { status: 204 }));
  await useCapitalStore.getState().removeCapital(1);
  assert.equal(useCapitalStore.getState().selectedCapitalId, null);
  useCapitalStore.getState().selectCapital(2);
  mock.mock.mockImplementation(async () => Response.json([]));
  await useCapitalStore.getState().fetchCapitals();
  assert.equal(useCapitalStore.getState().selectedCapitalId, null);
});

test("rows use native selection buttons, with actions outside their activation targets", () => {
  useCapitalStore.setState({ capitals: [prague], selectedCapitalId: 1 });
  const html = renderToStaticMarkup(<CapitalActions><CapitalList capitals={[prague]} loading={false} error={null} onRetry={async () => {}} /></CapitalActions>);
  assert.match(html, /<button type="button" class="capital-label" aria-label="Show Prague, Czechia on map" aria-pressed="false">/);
  assert.match(html, /<\/button><div class="row-actions"><button[^>]*aria-label="Actions for Prague"/);
});
