import assert from "node:assert/strict";
import { afterEach, test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ComponentProps } from "react";
import { CapitalActions } from "../src/CapitalActions";
import { CapitalList, filterCapitals } from "../src/CapitalList";
import { useCapitalStore } from "../src/capital-store";

const initialState = useCapitalStore.getInitialState();
const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
function renderList(props: Partial<ComponentProps<typeof CapitalList>> = {}) {
  return renderToStaticMarkup(<CapitalActions><CapitalList capitals={[berlin]} loading={false} error={null} onRetry={async () => {}} {...props} /></CapitalActions>);
}
afterEach(() => useCapitalStore.setState(initialState, true));

test("list exposes country/capital names, counts and native selection separate from actions", () => {
  // SSR covers initial semantics; real selection/focus is checked in map-selection.browser.
  const html = renderList();
  assert.match(html, /<ul[^>]*><li/);
  assert.match(html, />Berlin</);
  assert.match(html, />Germany</);
  const selection = html.match(/<button[^>]*aria-label="Show Berlin, Germany on map"[^>]*>/)![0];
  assert.ok(selection.includes('type="button"'));
  assert.ok(selection.includes('aria-pressed="false"'));
  // The row's actions are a sibling of the selection button, never nested.
  assert.match(html, /<\/button><div[^>]*><button[^>]*aria-label="Actions for Berlin"/);
  assert.match(html, /aria-label="1 capital"/);
});

test("skip link precedes results in loaded, loading and error states", () => {
  for (const state of [{}, { loading: true }, { error: "Unavailable" }]) {
    const html = renderList(state);
    assert.match(html, /<a[^>]*href="#world-map"/);
    assert.ok(html.indexOf('href="#world-map"') < html.indexOf('aria-label="Capital results"'));
  }
});

test("loading marks the results busy and hides stale records and retry", () => {
  const html = renderList({ loading: true });
  assert.match(html, /role="region"[^>]*aria-label="Capital results"[^>]*aria-busy="true"/);
  assert.doesNotMatch(html, /Berlin|Try again/);
});

test("empty results have a status and errors expose an alert with a retry button", () => {
  assert.match(renderList({ capitals: [] }), /role="status">No capitals available/);
  const html = renderList({ error: "Unavailable" });
  assert.match(html, /role="alert">Unavailable/);
  assert.match(html, /<button[^>]*type="button"[^>]*>Try again<\/button>/);
  assert.doesNotMatch(html, /Berlin/);
});

test("search matches trimmed case-insensitive country/capital text without changing canonical data", () => {
  const prague = { ...berlin, id: 2, name: "Prague", country: "Czechia" };
  const capitals = [berlin, prague];
  const snapshot = structuredClone(capitals);
  for (const query of ["  bErLiN  ", "GERM", "lin"]) assert.deepEqual(filterCapitals(capitals, query), [berlin]);
  assert.deepEqual(filterCapitals(capitals, "czech"), [prague]);
  assert.deepEqual(filterCapitals(capitals, "   "), capitals);
  assert.deepEqual(filterCapitals(capitals, "not a country"), []);
  assert.deepEqual(capitals, snapshot);
});

test("collapsed sidebar retains a hidden, labeled search surface", () => {
  const html = renderList({ collapsed: true });
  assert.match(html, /<aside[^>]*id="capital-sidebar"[^>]*hidden=""/);
  assert.match(html, /<label[^>]*for="capital-search"/);
  assert.match(html, /type="search"[^>]*aria-describedby="search-results-count"/);
  assert.match(html, /id="search-results-count"[^>]*role="status">1 of 1 capital/);
});
