import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { CapitalActions } from "../src/CapitalActions";
import { CapitalList, filterCapitals } from "../src/CapitalList";
import { getCapitals } from "../src/api";
import { useCapitalStore } from "../src/capital-store";

const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };

afterEach(() => { useCapitalStore.setState({ capitals: [], loading: false, error: null }); });

test("API requests the plain capital array with native fetch", async (t) => {
  const signal = new AbortController().signal;
  const timeoutMock = t.mock.method(AbortSignal, "timeout", () => signal);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json([berlin]));
  assert.deepEqual(await getCapitals(), [berlin]);
  assert.deepEqual(timeoutMock.mock.calls[0].arguments, [15_000]);
  assert.deepEqual(fetchMock.mock.calls[0].arguments, ["/capital", { headers: { Accept: "application/json" }, signal }]);
});

test("API accepts an empty array", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json([]));
  assert.deepEqual(await getCapitals(), []);
});

test("API reports HTTP errors without displaying server internals", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("private database details", { status: 500 }));
  await assert.rejects(getCapitals(), { message: "Unable to load capitals (HTTP 500). Please try again." });
});

test("API reports network failures", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(getCapitals(), /Could not reach the capital API/);
});

test("API times out while reading a response body with a safe message", async (t) => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", () => controller.signal);
  const response = Response.json([berlin]);
  t.mock.method(response, "json", () => new Promise((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
    controller.abort(new DOMException("Internal timeout details", "TimeoutError"));
  }));
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(getCapitals(), { message: "The capital API took too long to respond. Please try again." });
});

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
  await fetchCapitals();
  assert.equal(attempts, 2);
  assert.equal(useCapitalStore.getState().error, null);
  assert.deepEqual(useCapitalStore.getState().capitals, [berlin]);
});

test("API rejects malformed JSON and incompatible response shapes", async (t) => {
  for (const body of ["not JSON", "null", "{}", JSON.stringify({ data: [berlin] }), "[null]",
    JSON.stringify([{ ...berlin, country: "" }]), JSON.stringify([{ ...berlin, latitude: 91 }])]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(body));
    await assert.rejects(getCapitals(), /invalid response/);
    fetchMock.mock.restore();
  }
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

// Render each list state without needing a browser or Mapbox token.
// The actual click/lifecycle/layout checks are performed separately in Playwright.
test("list renders country and capital names using semantic list items", () => {
  const html = renderToStaticMarkup(<CapitalActions><CapitalList capitals={[berlin]} loading={false} error={null} onRetry={async () => {}} /></CapitalActions>);
  assert.match(html, /<h2[^>]*>Countries &amp; capitals<\/h2>/);
  assert.match(html, /<ul[^>]*><li[^>]*><button[^>]*>.*class="capital-name">Berlin<\/span><span class="country">Germany<\/span>/);
  assert.match(html, /aria-label="Actions for Berlin" aria-expanded="false"/);
  assert.doesNotMatch(html, />Edit<|>Delete</);
  assert.match(html, /aria-label="1 capital"/);
});

test("skip link is available before the long list, including loading and error states", () => {
  for (const state of [{ loading: false, error: null }, { loading: true, error: null }, { loading: false, error: "Unable to load capitals." }]) {
    const html = renderToStaticMarkup(<CapitalActions><CapitalList capitals={[berlin]} {...state} onRetry={async () => {}} /></CapitalActions>);
    assert.match(html, /<a[^>]*href="#world-map"[^>]*>Skip to map<\/a>/);
    assert.ok(html.indexOf("Skip to map") < html.indexOf('aria-label="Capital results"'));
  }
});

test("list announces loading and hides stale data", () => {
  const html = renderToStaticMarkup(<CapitalActions><CapitalList capitals={[berlin]} loading={true} error={null} onRetry={async () => {}} /></CapitalActions>);
  assert.match(html, /aria-busy="true"/);
  assert.match(html, /role="region" aria-label="Capital results" aria-busy="true" tabindex="0"/);
  assert.match(html, /role="status">Loading capitals…/);
  assert.doesNotMatch(html, /Berlin|Try again/);
});

test("list explains an empty result", () => {
  assert.match(renderToStaticMarkup(<CapitalActions><CapitalList capitals={[]} loading={false} error={null} onRetry={async () => {}} /></CapitalActions>), /role="status">No capitals available yet\./);
});

test("list announces errors and renders an accessible retry button", () => {
  const html = renderToStaticMarkup(<CapitalActions><CapitalList capitals={[]} loading={false} error="Unable to load capitals." onRetry={async () => {}} /></CapitalActions>);
  assert.match(html, /role="alert">Unable to load capitals\./);
  assert.match(html, /<button type="button">Try again<\/button>/);
});

test("search matches trimmed, case-insensitive country or capital without changing canonical data", () => {
  const prague = { ...berlin, id: 2, name: "Prague", country: "Czechia" };
  const capitals = [berlin, prague];
  for (const query of ["  bErLiN  ", "GERM", "lin"]) assert.deepEqual(filterCapitals(capitals, query), [berlin]);
  assert.deepEqual(filterCapitals(capitals, "czech"), [prague]);
  assert.deepEqual(filterCapitals(capitals, "   "), capitals);
  assert.deepEqual(filterCapitals(capitals, "not a country"), []);
  assert.deepEqual(capitals, [berlin, prague]);
});

test("collapsed sidebar uses native hidden while retaining the search and CRUD surface", () => {
  const html = renderToStaticMarkup(<CapitalActions><CapitalList capitals={[berlin]} loading={false} error={null} collapsed onRetry={async () => {}} /></CapitalActions>);
  assert.match(html, /<aside id="capital-sidebar" class="sidebar" hidden=""/);
  assert.match(html, /<label[^>]*for="capital-search">Search countries or capitals/);
  assert.match(html, /type="search"[^>]*aria-describedby="search-results-count"/);
  assert.match(html, /id="search-results-count"[^>]*role="status">1 of 1 capital/);
  assert.match(html, /aria-label="Actions for Berlin" aria-expanded="false"/);
});
