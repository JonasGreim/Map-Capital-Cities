import assert from "node:assert/strict";
import { test } from "node:test";
import { centerRowInList } from "../src/CapitalList";

test("map reveal centers variable-height rows and clamps at both list boundaries", () => {
  // Geometry is in viewport coordinates, including an already-scrolled list
  // and its border. No document scroll or focus API is available to this helper.
  for (const [top, height, expected] of [[502, 60, 298], [352, 120, 178], [-100, 60, 0], [1400, 60, 800]]) {
    const scroller = { scrollTop: 100, clientTop: 2, clientHeight: 400, scrollHeight: 1200,
      getBoundingClientRect: () => ({ top: 132 }) } as HTMLDivElement;
    const row = { getBoundingClientRect: () => ({ top, height }) } as HTMLButtonElement;
    centerRowInList(scroller, row);
    assert.equal(scroller.scrollTop, expected);
  }
});

test("reveal leaves a non-scrollable list at its start even for a tall row", () => {
  const scroller = { scrollTop: 0, clientTop: 0, clientHeight: 400, scrollHeight: 400,
    getBoundingClientRect: () => ({ top: 0 }) } as HTMLDivElement;
  const row = { getBoundingClientRect: () => ({ top: 0, height: 600 }) } as HTMLButtonElement;
  centerRowInList(scroller, row);
  assert.equal(scroller.scrollTop, 0);
});
