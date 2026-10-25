import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { resetCapitals } from "../src/api";
import { useCapitalStore } from "../src/capital-store";
import { ResetCapitalsDialog } from "../src/ResetCapitalsDialog";
import { CapitalActions } from "../src/CapitalActions";
import { CapitalList } from "../src/CapitalList";

const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
const restored = { ...berlin, id: 100, flagCode: "DE" };
afterEach(() => useCapitalStore.setState({ capitals: [], loading: false, error: null, mutating: false, selectedCapitalId: null, resetVersion: 0 }));

test("reset POST sends only explicit confirmation and reads validated capitals", async (t) => {
  const mock = t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    assert.equal(options?.method, "POST");
    assert.deepEqual(JSON.parse(options!.body as string), { confirm: true });
    assert.equal((options!.headers as Record<string, string>)["Content-Type"], "application/json");
    return Response.json([restored]);
  });
  assert.deepEqual(await resetCapitals(), [restored]);
  assert.equal(mock.mock.calls[0].arguments[0], "/capital-reset");
  assert.equal(mock.mock.callCount(), 1);
});

test("successful reset atomically replaces data, clears selection and signals color reset", async (t) => {
  useCapitalStore.setState({ capitals: [berlin], selectedCapitalId: 1 });
  t.mock.method(globalThis, "fetch", async () => Response.json([restored]));
  const updates: unknown[] = [];
  const unsubscribe = useCapitalStore.subscribe((state, old) => {
    if (state.capitals !== old.capitals) updates.push([state.capitals, state.selectedCapitalId, state.resetVersion]);
  });
  try { await useCapitalStore.getState().resetCapitals(); }
  finally { unsubscribe(); }
  assert.deepEqual(updates, [[[restored], null, 1]]);
  assert.equal(useCapitalStore.getState().mutating, false);
});

test("pending reset prevents double submit, CRUD and overlapping reads", async (t) => {
  let release!: (response: Response) => void;
  const fetch = t.mock.method(globalThis, "fetch", () => new Promise<Response>(resolve => { release = resolve; }));
  const pending = useCapitalStore.getState().resetCapitals();
  assert.equal(useCapitalStore.getState().mutating, true);
  await assert.rejects(useCapitalStore.getState().resetCapitals(), /Please wait/);
  await assert.rejects(useCapitalStore.getState().saveCapital(berlin), /Please wait/);
  await assert.rejects(useCapitalStore.getState().removeCapital(1), /Please wait/);
  await useCapitalStore.getState().fetchCapitals();
  assert.equal(fetch.mock.callCount(), 1);
  release(Response.json([restored]));
  await pending;
  useCapitalStore.setState({ loading: true });
  await assert.rejects(useCapitalStore.getState().resetCapitals(), /Please wait/);
});

test("HTTP/network/invalid response failures preserve data, selection and colors with no retry", async (t) => {
  for (const failure of [500, 409, "network", "invalid", "empty", "duplicates"]) {
    useCapitalStore.setState({ capitals: [berlin], selectedCapitalId: 1 });
    const fetch = t.mock.method(globalThis, "fetch", async () => {
      if (failure === "network") throw new Error("secret internals");
      if (typeof failure === "number") return new Response("secret internals", { status: failure });
      if (failure === "invalid") return Response.json({ capitals: [restored] });
      return Response.json(failure === "empty" ? [] : [restored, restored]);
    });
    await assert.rejects(useCapitalStore.getState().resetCapitals(), (error: unknown) =>
      error instanceof Error && /Reload current data/.test(error.message) && !error.message.includes("secret"));
    const state = useCapitalStore.getState();
    assert.deepEqual(state.capitals, [berlin]);
    assert.equal(state.selectedCapitalId, 1);
    assert.equal(state.resetVersion, 0);
    assert.equal(state.mutating, false);
    assert.equal(fetch.mock.callCount(), 1);
    fetch.mock.restore();
  }
});

test("sidebar replaces refresh with adjacent reset; opening confirmation performs no write", () => {
  let writes = 0;
  const operation = async () => { writes++; };
  const sidebar = renderToStaticMarkup(<CapitalActions><CapitalList capitals={[berlin]} loading={false} error={null} onRetry={operation} /></CapitalActions>);
  assert.match(sidebar, /Add capital<\/button><button id="reset-capitals"/);
  assert.doesNotMatch(sidebar, /Refresh list/);
  const dialog = renderToStaticMarkup(<ResetCapitalsDialog onReset={operation} onReload={operation} onCancel={() => {}} />);
  assert.match(dialog, /all manually added capitals will be deleted/);
  assert.match(dialog, /shared demo data for everyone/);
  assert.match(dialog, /Teal/);
  assert.match(dialog, /autofocus=""[^>]*>Cancel/);
  assert.equal(writes, 0);
});
