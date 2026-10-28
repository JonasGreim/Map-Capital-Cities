import assert from "node:assert/strict";
import { test } from "node:test";
import { centerRowInList } from "../src/CapitalList";

test("map reveal centers variable-height rows and clamps at both list boundaries", () => {
  // Geometry is in viewport coordinates, including an already-scrolled list
  // and its border. No document scroll or focus API is available to this helper.
  for (const [top, height, scrollHeight, expected] of [[502, 60, 1200, 298], [352, 120, 1200, 178], [-100, 60, 1200, 0], [1400, 60, 1200, 800], [0, 600, 400, 0]]) {
    const scroller = { scrollTop: 100, clientTop: 2, clientHeight: 400, scrollHeight,
      getBoundingClientRect: () => ({ top: 132 }) } as HTMLDivElement;
    const row = { getBoundingClientRect: () => ({ top, height }) } as HTMLButtonElement;
    centerRowInList(scroller, row);
    assert.equal(scroller.scrollTop, expected);
  }
});
