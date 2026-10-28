/* global document, getComputedStyle */
import assert from "node:assert/strict";
import { capitalAPI, button, field, fillCapital, focused, dialogClosed, mapSettled, loseContext, restoreContext, positions } from "./browser-helpers.mjs";
import { showView } from "./view-helpers.mjs";

export async function verifyCoordinatePicker(page, baseURL) {
  const api = await capitalAPI(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL);
  await page.waitForFunction(() => !document.querySelector('[aria-label="Reset map view"]')?.disabled);
  await mapSettled(page);
  assert.equal(await page.getByRole("tab", { name: "Map", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await page.getByRole("searchbox").isVisible(), false);
  await page.emulateMedia({ reducedMotion: "reduce" });
  await showView(page, "Capitals"); await button(page, "Add capital").click();
  await fillCapital(page, { name: "Draft city", country: "Draft country", latitude: 12.5, longitude: -10.75 });
  const values = async () => [await field(page, "Latitude").inputValue(), await field(page, "Longitude").inputValue()];
  async function start() {
    await button(page, "Select on map").focus(); await page.keyboard.press("Enter");
    await page.locator(".coordinate-pick-banner").waitFor(); await focused(button(page, "Cancel"));
    assert.equal(await page.locator("dialog[open]").count(), 0);
    assert.equal(await page.locator(".map-navigation").isVisible(), false);
    assert.equal(await page.locator("canvas").evaluate(el => getComputedStyle(el).cursor), "crosshair");
    assert.equal(await page.getByRole("tab", { name: "Capitals", exact: true }).isDisabled(), true);
    await mapSettled(page);
  }
  async function ended() {
    await page.locator("dialog[open]").waitFor();
    assert.equal(await page.locator(".coordinate-pick-banner").count(), 0);
    assert.equal(await page.locator("canvas").evaluate(el => el.style.cursor), "");
  }
  async function pick(x = 0.65) {
    const point = await page.locator("canvas").evaluate((canvas, x) => {
      const b = canvas.getBoundingClientRect();
      for (const fx of [x, 0.3, 0.85]) for (const fy of [0.75, 0.6]) {
        const p = { x: b.x + b.width * fx, y: b.y + b.height * fy };
        if (document.elementFromPoint(p.x, p.y) === canvas) return p;
      }
      throw new Error("No unobstructed canvas point for picking");
    }, x);
    await page.mouse.click(point.x, point.y);
    await ended(); await focused(field(page, "Latitude"));
    const result = await values();
    assert.ok(result.every(value => /^-?\d+\.\d{6}$/.test(value)));
    assert.ok(Math.abs(Number(result[0])) <= 90 && Math.abs(Number(result[1])) <= 180);
    assert.equal(await page.locator(".coordinate-preview").count(), 1);
    return result;
  }
  await start(); await button(page, "Cancel").click(); await ended(); await focused(button(page, "Select on map"));
  assert.deepEqual(await values(), ["12.5", "-10.75"]);
  await start(); await page.keyboard.press("Escape"); await ended(); await focused(button(page, "Select on map"));
  assert.deepEqual(await values(), ["12.5", "-10.75"]);
  await start();
  await page.locator(".capital-marker").first().dispatchEvent("click");
  assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
  assert.equal(await page.locator(".coordinate-pick-banner").count(), 1);
  const beforeDrag = await positions(page), bounds = await page.locator("canvas").boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height * 0.8); await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width / 2 + 45, bounds.y + bounds.height * 0.8 - 25, { steps: 8 });
  await page.mouse.up(); await mapSettled(page);
  assert.notDeepEqual(await positions(page), beforeDrag, "Real drag must pan during picking");
  const beforeWheel = await positions(page);
  await page.locator("canvas").hover(); await page.mouse.wheel(0, -150); await mapSettled(page);
  assert.notDeepEqual(await positions(page), beforeWheel, "Wheel zoom must move real markers");
  assert.equal(await page.locator(".coordinate-pick-banner").count(), 1);
  const first = await pick();
  assert.equal(await field(page, "Capital name").inputValue(), "Draft city");
  assert.equal(api.writes.length, 0);
  await start(); await page.keyboard.press("Escape"); await ended();
  assert.deepEqual(await values(), first);
  assert.equal(await page.locator(".coordinate-preview").count(), 0);
  await start(); const second = await pick(0.8); assert.notDeepEqual(second, first);
  await field(page, "Latitude").fill("0");
  assert.equal(await page.locator(".coordinate-preview").count(), 0);
  await button(page, "Create capital").click(); await dialogClosed(page);
  assert.deepEqual(api.writes, [{ method: "POST", path: "/capital", input: {
    name: "Draft city", country: "Draft country", latitude: 0, longitude: Number(second[1]),
  } }]);

  await button(page, "Actions for Berlin").click(); await button(page, "Edit").click();
  await field(page, "Capital name").fill("Edited Berlin"); await start(); const edited = await pick();
  api.writeMode = 409;
  await button(page, "Save changes").click(); await page.locator("dialog").getByRole("alert").waitFor();
  assert.deepEqual(await values(), edited);
  assert.equal(await page.locator(".coordinate-preview").count(), 1);
  api.writeMode = "success"; await button(page, "Save changes").click(); await dialogClosed(page);
  assert.equal(await page.locator(".coordinate-preview").count(), 0);
  await button(page, "Actions for Edited Berlin").click(); await button(page, "Edit").click();
  await start();
  // Resizing an active pick must retain its draft and keep the same canvas.
  const canvas = await page.locator("canvas").elementHandle();
  for (const width of [1440, 320, 390]) {
    await page.setViewportSize({ width, height: 844 }); await mapSettled(page);
    assert.equal(await page.locator(".coordinate-pick-banner").isVisible(), true);
    assert.equal(await canvas.evaluate(el => el === document.querySelector("canvas")), true);
  }
  // Native WebGL lifecycle cancels picking back into the manual form safely.
  await loseContext(page); await ended();
  assert.equal(await button(page, "Select on map").isDisabled(), true);
  assert.equal(await field(page, "Capital name").inputValue(), "Edited Berlin");
  assert.deepEqual(await values(), edited);
  await restoreContext(page);
  await page.waitForFunction(() => !document.getElementById("pick-on-map")?.disabled);
  await start(); await pick();
  await button(page, "Cancel").click(); await dialogClosed(page);
  assert.equal(api.writes.length, 3);
  assert.equal(await page.locator(".coordinate-preview").count(), 0);
  await showView(page, "Map"); await mapSettled(page);
  const outside = await page.locator("canvas").boundingBox();
  await page.mouse.click(outside.x + outside.width * 0.8, outside.y + outside.height * 0.8);
  assert.equal(await page.locator("dialog[open], .coordinate-pick-banner").count(), 0);
  return { createEdit: true, draftCancelEscape: true, realPanAndPick: true, webglRecovery: true, breakpointDraft: true };
}
