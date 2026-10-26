import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { MapNavigation } from "../src/MapNavigation";

test("unavailable map controls expose native disabled buttons and accessible names", () => {
  const html = renderToStaticMarkup(<MapNavigation disabled={false} picking={false} />);
  assert.equal((html.match(/<button /g) ?? []).length, 3);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
  for (const label of ["Zoom in", "Zoom out", "Reset map view"]) {
    assert.ok(html.includes(`aria-label="${label}" title="${label}"`));
  }
  assert.equal((html.match(/type="button"/g) ?? []).length, 3);
});

test("picking hides the entire control group and disables all buttons", () => {
  const html = renderToStaticMarkup(<MapNavigation disabled={false} picking />);
  assert.match(html, /aria-label="Map navigation" hidden=""/);
  assert.equal((html.match(/disabled=""/g) ?? []).length, 3);
});
