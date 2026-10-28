import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createCapital, updateCapital, deleteCapital } from "../src/api";
import { validateCapital, CapitalForm, type CapitalFields } from "../src/CapitalForm";
import { DeleteCapitalDialog } from "../src/DeleteCapitalDialog";
import { useCapitalStore } from "../src/capital-store";

const input = { name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
const berlin = { ...input, id: 1 };
const fields: CapitalFields = { ...input, latitude: "52.52", longitude: "13.405" };
afterEach(() => useCapitalStore.setState(useCapitalStore.getInitialState(), true));

test("POST/PUT send complete numeric JSON without body id; DELETE accepts empty 204", async (t) => {
  const timeout = t.mock.method(AbortSignal, "timeout", () => new AbortController().signal);
  const fetch = t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) =>
    options?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json(berlin, { status: options?.method === "POST" ? 201 : 200 }));
  assert.deepEqual(await createCapital(berlin), berlin);
  assert.deepEqual(await updateCapital(1, input), berlin);
  assert.equal(await deleteCapital(1), undefined);
  assert.deepEqual(timeout.mock.calls.map(call => call.arguments), [[15_000], [15_000], [15_000]]);
  assert.deepEqual(fetch.mock.calls.map((call) => call.arguments[0]), ["/capital", "/capital/1", "/capital/1"]);
  assert.deepEqual(fetch.mock.calls.map(call => call.arguments[1]?.method), ["POST", "PUT", "DELETE"]);
  for (const call of fetch.mock.calls.slice(0, 2)) {
    const options = call.arguments[1]!;
    assert.deepEqual(JSON.parse(options.body as string), input);
    assert.equal((options.headers as Record<string, string>)["Content-Type"], "application/json");
    assert.ok(options.signal instanceof AbortSignal);
  }
});

test("mutations explain 400/404/409 and hide unexpected backend details", async (t) => {
  for (const [status, expected] of [[400, /Check all fields/], [404, /no longer exists/], [409, /already exists/], [500, /Unable to save/]] as const) {
    const mock = t.mock.method(globalThis, "fetch", async () => new Response("secret SQL details", { status }));
    await assert.rejects(createCapital(input), (error: unknown) => error instanceof Error && expected.test(error.message) && !error.message.includes("secret"));
    mock.mock.restore();
  }
});

test("network/timeout and malformed successful responses warn about uncertain writes", async (t) => {
  const fetch = t.mock.method(globalThis, "fetch", async () => { throw new Error("internal connection"); });
  await assert.rejects(createCapital(input), /may have been saved/);
  const controller = new AbortController();
  controller.abort();
  t.mock.method(AbortSignal, "timeout", () => controller.signal);
  await assert.rejects(createCapital(input), /took too long/);
  fetch.mock.restore();
  for (const response of [Response.json({ ...berlin, id: 2 }), Response.json({}), new Response("invalid")]) {
    const mock = t.mock.method(globalThis, "fetch", async () => response);
    await assert.rejects(updateCapital(1, input), /invalid response/);
    mock.mock.restore();
  }
});

test("validation requires every field, trims names and emits numeric coordinates", () => {
  assert.deepEqual(validateCapital({ name: " ", country: "", latitude: "", longitude: " " }).errors, {
    name: "Capital name is required.", country: "Country name is required.", latitude: "Latitude is required.", longitude: "Longitude is required.",
  });
  assert.deepEqual(validateCapital({ ...fields, name: " Berlin ", country: " Germany " }), { errors: {}, input });
  assert.ok(validateCapital({ ...fields, name: "bad\0name" }).errors.name);
});

test("coordinate validation rejects nonfinite/nonnumeric/out-of-range values and accepts boundaries/zero", () => {
  for (const [field, bound] of [["latitude", 90], ["longitude", 180]] as const) {
    for (const value of ["NaN", "Infinity", "abc", String(bound + 0.01), String(-bound - 0.01)]) {
      assert.ok(validateCapital({ ...fields, [field]: value }).errors[field]);
    }
    for (const value of ["0", String(bound), String(-bound), "1e1"]) {
      assert.deepEqual(validateCapital({ ...fields, [field]: value }).errors, {});
    }
  }
});

test("successful store mutations synchronize canonical records for all subscribers without extra GETs", async (t) => {
  const replacement = { ...input, name: "Aachen", latitude: 20, longitude: 30 };
  const created = { ...berlin, flagCode: "DE", continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] };
  const edited = { ...replacement, id: berlin.id, flagCode: "CZ", continents: ["Europe"], population: 10000000, currencies: [{ code: "CZK", name: "Czech koruna" }] };
  const fetch = t.mock.method(globalThis, "fetch", async (_url: unknown, options?: RequestInit) => {
    if (options?.method === "POST") return Response.json(created, { status: 201 });
    if (options?.method === "PUT") return Response.json(edited);
    return new Response(null, { status: 204 });
  });
  const snapshots: unknown[] = [];
  const unsubscribe = useCapitalStore.subscribe((state, previous) => { if (state.capitals !== previous.capitals) snapshots.push(state.capitals); });
  try {
    await useCapitalStore.getState().saveCapital(input);
    assert.deepEqual(useCapitalStore.getState().capitals, [created]);
    await useCapitalStore.getState().saveCapital(replacement, 1);
    assert.deepEqual(useCapitalStore.getState().capitals, [edited]);
    await useCapitalStore.getState().removeCapital(1);
    assert.deepEqual(useCapitalStore.getState().capitals, []);
    assert.deepEqual(snapshots, [[created], [edited], []]);
    assert.equal(fetch.mock.callCount(), 3);
  } finally { unsubscribe(); }
});

test("failed mutations preserve shared data, reject to the form and release pending state", async (t) => {
  useCapitalStore.setState({ capitals: [berlin] });
  t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 409 }));
  for (const operation of [() => useCapitalStore.getState().saveCapital(input), () => useCapitalStore.getState().saveCapital(input, 1), () => useCapitalStore.getState().removeCapital(1)]) {
    await assert.rejects(operation(), /already exists/);
    assert.deepEqual(useCapitalStore.getState().capitals, [berlin]);
    assert.equal(useCapitalStore.getState().mutating, false);
  }
});

test("pending mutations block duplicate writes/reloads and loading blocks mutations", async (t) => {
  let resolve!: (response: Response) => void;
  const fetch = t.mock.method(globalThis, "fetch", () => new Promise<Response>((done) => { resolve = done; }));
  const pending = useCapitalStore.getState().saveCapital(input);
  assert.equal(useCapitalStore.getState().mutating, true);
  await assert.rejects(useCapitalStore.getState().saveCapital(input), /Please wait/);
  await assert.rejects(useCapitalStore.getState().removeCapital(1), /Please wait/);
  await useCapitalStore.getState().fetchCapitals();
  assert.equal(fetch.mock.callCount(), 1);
  resolve(Response.json(berlin));
  await pending;
  assert.equal(useCapitalStore.getState().mutating, false);
  useCapitalStore.setState({ loading: true });
  await assert.rejects(useCapitalStore.getState().saveCapital(input), /Please wait/);
  assert.equal(fetch.mock.callCount(), 1);
});

test("create/edit expose labeled required fields, ranges and unchanged coordinate values", () => {
  for (const capital of [undefined, { ...berlin, latitude: 12.12345678, longitude: -1 }]) {
    const html = renderToStaticMarkup(<CapitalForm capital={capital} onSave={async () => {}} onCancel={() => {}} />);
    assert.match(html, /<dialog[^>]*aria-labelledby="dialog-title"/);
    assert.match(html, /aria-describedby="dialog-description"/);
    assert.match(html, /aria-label="Close dialog"/);
    for (const field of ["name", "country", "latitude", "longitude"] as const) {
      assert.ok(html.includes(`for="capital-${field}"`));
      const control = html.match(new RegExp(`<input[^>]*name="${field}"[^>]*>`))![0];
      assert.ok(control.includes(`id="capital-${field}"`));
      assert.ok(control.includes('required=""'));
      assert.ok(control.includes(`value="${capital ? capital[field] : ""}"`));
      if (field === "latitude" || field === "longitude") {
        const bound = field === "latitude" ? 90 : 180;
        for (const attribute of ['type="number"', 'step="any"', `min="-${bound}"`, `max="${bound}"`, `aria-describedby="${field}-range"`]) {
          assert.ok(control.includes(attribute));
        }
      }
    }
  }
  const confirmation = renderToStaticMarkup(<DeleteCapitalDialog capital={berlin} onDelete={async () => {}} onCancel={() => {}} />);
  assert.match(confirmation, /Delete Berlin, Germany/);
});
