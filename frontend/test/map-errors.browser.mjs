/* global HTMLCanvasElement */
import assert from "node:assert/strict";
import { capitalAPI, button, field, row, focused, dialogClosed, mapSettled, loseContext } from "./browser-helpers.mjs";

export async function verifyMapErrors(page, baseURL, mode) {
  const api = await capitalAPI(page);
  let rejectStyle = mode === "style";
  if (mode === "construction") {
    // Native browser capability failure, not app or Mapbox source rewriting.
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function(type, ...args) {
        return type.includes("webgl") ? null : getContext.call(this, type, ...args);
      };
    });
  } else {
    await page.route("https://api.mapbox.com/styles/v1/mapbox/streets-v12?*", route => rejectStyle
      ? route.fulfill({ status: 503, json: { message: "Controlled style failure" } }) : route.continue());
  }
  await page.goto(baseURL);
  await page.getByText(mode === "construction"
    ? "Map could not load. Check your Mapbox token and connection. The capital list is still available."
    : "Map resources could not load. Check your Mapbox token and connection. The capital list is still available.", { exact: true }).waitFor();
  for (const label of ["Zoom in", "Zoom out", "Reset map view"]) assert.equal(await button(page, label).isDisabled(), true);
  await row(page, "Berlin", "Germany").waitFor();
  await button(page, "Actions for Berlin").click(); await button(page, "Edit").click();
  assert.equal(await button(page, "Select on map").isDisabled(), true);
  await field(page, "Latitude").fill("0");
  assert.equal(await field(page, "Latitude").inputValue(), "0");
  await page.keyboard.press("Escape"); await dialogClosed(page); await focused(button(page, "Actions for Berlin"));
  assert.equal(api.writes.length, 0);
  if (mode === "style") {
    // Recovering WebGL alone must not mark a still-failed initial style ready.
    await loseContext(page);
    await page.getByText("Map could not load. Check your Mapbox token and connection. The capital list is still available.", { exact: true }).waitFor();
    await page.evaluate(() => globalThis.browserContextLoss.restoreContext());
    await page.getByText("Map resources could not load. Check your Mapbox token and connection. The capital list is still available.", { exact: true }).waitFor();
    assert.equal(await button(page, "Reset map view").isDisabled(), true);
    rejectStyle = false; await page.reload();
    await page.waitForFunction(() => !globalThis.document.querySelector('[aria-label="Reset map view"]')?.disabled);
    await page.locator(".map-error").waitFor({ state: "hidden" });
    await row(page, "Berlin", "Germany").click(); await page.locator(".capital-popup").waitFor(); await mapSettled(page);
  }
  return { mode, independentListAndForm: true, realReloadRecovery: mode === "style" };
}
