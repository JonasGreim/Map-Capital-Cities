import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { useCapitalStore } from "../src/capital-store";

const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
afterEach(() => useCapitalStore.setState(useCapitalStore.getInitialState(), true));

test("store releases a timed-out request and retry uses a fresh signal", async (t) => {
  const controller = new AbortController();
  let attempts = 0;
  t.mock.method(AbortSignal, "timeout", () => attempts === 0 ? controller.signal : new AbortController().signal);
  t.mock.method(globalThis, "fetch", async (_url: RequestInfo | URL, options?: RequestInit) => {
    attempts += 1;
    if (attempts === 1) {
      return new Promise<Response>((_resolve, reject) => {
        options!.signal!.addEventListener("abort", () => reject(options!.signal!.reason), { once: true });
      });
    }
    assert.equal(options!.signal!.aborted, false);
    return Response.json([berlin]);
  });
  const fetchCapitals = useCapitalStore.getState().fetchCapitals;
  const request = fetchCapitals();
  assert.equal(useCapitalStore.getState().loading, true);
  controller.abort(new DOMException("Internal timeout details", "TimeoutError"));
  await request;
  assert.equal(useCapitalStore.getState().loading, false);
  assert.equal(useCapitalStore.getState().error, "The capital API took too long to respond. Please try again.");
  assert.equal(useCapitalStore.getState().hasLoaded, false);
  await fetchCapitals();
  assert.equal(attempts, 2);
  assert.equal(useCapitalStore.getState().error, null);
  assert.equal(useCapitalStore.getState().hasLoaded, true);
  assert.deepEqual(useCapitalStore.getState().capitals, [berlin]);
});

test("store shares a pending request and exposes loading then real data", async (t) => {
  let resolve!: (response: Response) => void;
  const response = new Promise<Response>((done) => { resolve = done; });
  const fetchMock = t.mock.method(globalThis, "fetch", () => response);
  const first = useCapitalStore.getState().fetchCapitals();
  const second = useCapitalStore.getState().fetchCapitals();
  assert.equal(first, second);
  assert.equal(fetchMock.mock.callCount(), 1);
  assert.equal(useCapitalStore.getState().loading, true);
  assert.equal(useCapitalStore.getState().error, null);
  resolve(Response.json([berlin]));
  await first;
  assert.deepEqual(useCapitalStore.getState().capitals, [berlin]);
  assert.equal(useCapitalStore.getState().loading, false);
});

test("store exposes failures, clears the error on retry and replaces data on reload", async (t) => {
  let attempts = 0;
  t.mock.method(globalThis, "fetch", async () => {
    attempts += 1;
    return attempts === 1 ? new Response(null, { status: 503 }) : Response.json(attempts === 2 ? [berlin] : []);
  });
  const fetchCapitals = useCapitalStore.getState().fetchCapitals;
  await fetchCapitals();
  assert.match(useCapitalStore.getState().error!, /HTTP 503/);
  assert.equal(useCapitalStore.getState().loading, false);
  const retry = fetchCapitals();
  assert.equal(useCapitalStore.getState().error, null);
  assert.equal(useCapitalStore.getState().loading, true);
  await retry;
  assert.deepEqual(useCapitalStore.getState().capitals, [berlin]);
  await fetchCapitals();
  assert.deepEqual(useCapitalStore.getState().capitals, []);
  assert.equal(useCapitalStore.getState().error, null);
  assert.equal(attempts, 3);
});
