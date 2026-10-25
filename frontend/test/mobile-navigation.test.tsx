import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MobileNavigation, tabDestination } from "../src/MobileNavigation";

test("mobile tabs announce exactly one active destination with matching panel relationships", () => {
  for (const active of ["map", "capitals"] as const) {
    const html = renderToStaticMarkup(<MobileNavigation active={active} onChange={() => {}} />);
    assert.equal((html.match(/role="tab"/g) ?? []).length, 2);
    assert.equal((html.match(/aria-selected="true"/g) ?? []).length, 1);
    assert.match(html, new RegExp(`id="${active}-tab"[^>]+aria-selected="true"[^>]+tabindex="0"`));
    assert.match(html, /role="tablist" aria-label="Map and capitals"/);
    assert.match(html, /aria-controls="world-map"/);
    assert.match(html, /aria-controls="capital-sidebar"/);
    assert.match(html, />Map<\/button>/);
    assert.match(html, />Capitals<\/button>/);
  }
});

test("automatic tab activation wraps arrows and supports Home/End; native activation keys pass through", () => {
  for (const current of ["map", "capitals"] as const) {
    for (const key of ["ArrowLeft", "ArrowRight"]) assert.equal(tabDestination(key, current), current === "map" ? "capitals" : "map");
    assert.equal(tabDestination("Home", current), "map");
    assert.equal(tabDestination("End", current), "capitals");
    for (const key of ["Tab", "Enter", " ", "Escape", "ArrowDown"]) assert.equal(tabDestination(key, current), undefined);
  }
});

test("coordinate picking temporarily disables both view controls", () => {
  const html = renderToStaticMarkup(<MobileNavigation active="map" disabled onChange={() => {}} />);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 2);
});
