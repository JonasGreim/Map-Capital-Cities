import assert from "node:assert/strict";
import { test } from "node:test";
import type { Map as MapboxMap, MapMouseEvent } from "mapbox-gl";
import { renderToStaticMarkup } from "react-dom/server";
import { formatPickedCoordinates, listenForCoordinates } from "../src/coordinate-picker";
import { CapitalForm } from "../src/CapitalForm";

test("picked coordinates retain lat/lng order, six decimals, signs, zero and boundaries", () => {
  for (const [lat, lng, latitude, longitude] of [
    [52.5200084, 13.4049544, "52.520008", "13.404954"],
    [-33.9248694, -70.6692659, "-33.924869", "-70.669266"],
    [0, 0, "0.000000", "0.000000"], [90, 180, "90.000000", "180.000000"],
    [0, 13, "0.000000", "13.000000"], [-33, 0, "-33.000000", "0.000000"],
    [-90, -180, "-90.000000", "-180.000000"],
  ] as const) {
    const coordinates = formatPickedCoordinates(lat, lng)!;
    assert.deepEqual(coordinates, { latitude, longitude });
  }
  for (const [lat, lng] of [[NaN, 0], [0, Infinity], [-Infinity, 0], [90.000001, 0], [-91, 0], [0, 181], [0, -180.000001]]) {
    assert.equal(formatPickedCoordinates(lat, lng), null);
  }
});

test("canvas clicks choose once; controls and invalid points do not; cleanup restores cursor and listener", () => {
  const canvas = { style: { cursor: "grab" } };
  const listeners = new Set<(event: MapMouseEvent) => void>();
  const map = {
    getCanvas: () => canvas,
    on: (_type: string, listener: (event: MapMouseEvent) => void) => listeners.add(listener),
    off: (_type: string, listener: (event: MapMouseEvent) => void) => listeners.delete(listener),
  } as unknown as MapboxMap;
  const results: unknown[] = [];
  const click = (target: unknown, lat = 0, lng = 0) => {
    for (const listener of listeners) listener({ originalEvent: { target }, lngLat: { lat, lng } } as MapMouseEvent);
  };
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const dispose = listenForCoordinates(map, result => {
      // The callback resumes a native modal. Cleanup must precede that handoff.
      assert.equal(canvas.style.cursor, "grab");
      assert.equal(listeners.size, 0);
      results.push(result);
    });
    assert.equal(canvas.style.cursor, "crosshair");
    assert.equal(listeners.size, 1);
    click({}); // A marker, popup or Mapbox control.
    click(canvas, NaN);
    assert.equal(results.length, attempt);
    click(canvas, -25, 130);
    click(canvas, 50, 10); // A queued second click cannot replace the choice.
    assert.equal(results.length, attempt + 1);
    assert.deepEqual(results.at(-1), { latitude: "-25.000000", longitude: "130.000000" });
    dispose(); dispose();
    assert.equal(listeners.size, 0);
    assert.equal(canvas.style.cursor, "grab");
    click(canvas);
    assert.equal(results.length, attempt + 1);
  }
  const cancel = listenForCoordinates(map, () => assert.fail("Canceled picker must not choose"));
  cancel(); click(canvas);
  assert.equal(canvas.style.cursor, "grab");
  assert.equal(listeners.size, 0);
});

test("cleanup is idempotent and preserves a newer tool or picking session's cursor", () => {
  const canvas = { style: { cursor: "" } };
  const map = { getCanvas: () => canvas, on: () => {}, off: () => {} } as unknown as MapboxMap;
  const first = listenForCoordinates(map, () => {});
  first();
  const second = listenForCoordinates(map, () => {});
  first(); // A late cleanup must not reset the new session's crosshair.
  assert.equal(canvas.style.cursor, "crosshair");
  canvas.style.cursor = "pointer"; // Another tool takes ownership.
  second();
  assert.equal(canvas.style.cursor, "pointer");
  second();
  assert.equal(canvas.style.cursor, "pointer");
});

test("map picking is a secondary non-submit action with an explained manual fallback", () => {
  const picker = { available: true, active: false, start: () => {}, clearPreview: () => {} };
  const render = (available: boolean) => renderToStaticMarkup(<CapitalForm picker={{ ...picker, available }} onSave={async () => {}} onCancel={() => {}} />);
  assert.match(render(true), /<button[^>]*id="pick-on-map"[^>]*type="button"/);
  assert.match(render(false), /disabled="" aria-describedby="pick-unavailable"/);
  assert.match(render(false), /Enter coordinates manually/);
  assert.match(render(true), /Select on map<\/button>/);
  assert.match(render(true), /aria-describedby="pick-description"/);
});
