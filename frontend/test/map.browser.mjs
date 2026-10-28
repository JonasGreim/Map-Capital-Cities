/* global document, localStorage, sessionStorage, Storage, getComputedStyle */
import assert from "node:assert/strict";
import { capitalAPI, capitals, button, field, row, marker, fillCapital, focused, dialogClosed, mapSettled, positions, popupFits, reachable, noOverflow } from "./browser-helpers.mjs";
import { chooseContinent, continentValue } from "./continent-helpers.mjs";
import { showView } from "./view-helpers.mjs";

export async function verifyMap(page, baseURL) {
  const longName = `São Tomé – ${"Verylongunbrokencapitalname".repeat(3)}`;
  const defaults = [...capitals, ...Array.from({ length: 24 }, (_, i) => ({ id: i + 10, name: `Capital ${i}`, country: `Country ${i}`, latitude: -30, longitude: -50 + i })),
    { id: 40, name: longName, country: "A very long country name that wraps across several lines", latitude: 0, longitude: 0,
      continents: ["Asia", "Europe"], currencies: [{ code: "EUR", name: "An exceptionally long currency name that wraps inside a small popup" }] }];
  const api = await capitalAPI(page, defaults);
  await page.addInitScript(() => {
    if (sessionStorage.getItem("block-storage")) {
      const set = Storage.prototype.setItem, remove = Storage.prototype.removeItem;
      Storage.prototype.setItem = function(...args) {
        if (this === sessionStorage) return set.apply(this, args);
        throw new Error("QuotaExceededError");
      };
      Storage.prototype.removeItem = function(...args) {
        if (this === sessionStorage) return remove.apply(this, args);
        throw new Error("SecurityError");
      };
    }
    if (sessionStorage.getItem("block-storage-getter")) Object.defineProperty(globalThis, "localStorage", { get() { throw new Error("SecurityError"); } });
  });
  await page.goto(baseURL);
  await page.waitForFunction(() => !document.querySelector('[aria-label="Reset map view"]')?.disabled);
  await mapSettled(page);
  const canvas = await page.locator(".mapboxgl-canvas").elementHandle();
  const originalMarker = await marker(page, "Berlin", "Germany").elementHandle();
  const initial = await positions(page), reads = api.reads;
  const search = page.getByRole("searchbox", { includeHidden: true });
  const open = async (name = "Berlin", country = "Germany") => {
    await showView(page, "Capitals"); await row(page, name, country).click();
    await page.locator(".capital-popup").waitFor(); await mapSettled(page); await popupFits(page);
  };
  const action = async name => { await page.locator(".popup-actions-trigger").tap(); await button(page, name).click(); await page.locator("dialog[open]").waitFor(); };
  await button(page, "Zoom in").focus(); await page.keyboard.press("Enter"); await mapSettled(page);
  assert.notDeepEqual(await positions(page), initial, "Zoom must visibly move real markers");
  await page.keyboard.press("Tab"); await focused(button(page, "Zoom out"));
  await page.keyboard.press("Space"); await mapSettled(page);
  assert.deepEqual(await positions(page), initial);
  await page.locator(".mapboxgl-canvas").focus(); await page.keyboard.press("ArrowRight"); await mapSettled(page);
  assert.notDeepEqual(await positions(page), initial, "Keyboard pan must move the map");
  await button(page, "Reset map view").click(); await mapSettled(page);
  assert.deepEqual(await positions(page), initial);

  await open(); await focused(button(page, "Teal marker"));
  await page.keyboard.press("Tab"); await focused(button(page, "Red marker")); await page.keyboard.press("Space");
  assert.equal(await marker(page, "Berlin", "Germany").evaluate(el => el.style.backgroundColor), "rgb(180, 35, 24)");
  const key = "map-capital-cities.marker-colors.v1";
  assert.deepEqual(await page.evaluate(key => JSON.parse(localStorage.getItem(key)), key), { 1: "#b42318" });
  const selectedView = await positions(page);
  await search.fill("Tokyo");
  assert.deepEqual(await page.locator(".capital-name").allTextContents(), ["Tokyo"]);
  assert.equal(await page.locator(".capital-marker:not([hidden])").count(), defaults.length);
  assert.deepEqual(await positions(page), selectedView);
  await button(page, "Clear search").click();
  await chooseContinent(page, "Asia");
  assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
  assert.equal(await marker(page, "Berlin", "Germany").isDisabled(), true);
  assert.equal(await marker(page, "Berlin", "Germany").getAttribute("tabindex"), "-1");
  assert.equal(await marker(page, "Berlin", "Germany").evaluate(el => { el.focus(); el.click(); return el === document.activeElement; }), false);
  assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
  await chooseContinent(page, "Europe");
  assert.deepEqual(await page.locator(".capital-name").allTextContents(), ["Berlin", "Prague", longName]);
  await search.fill("Tokyo");
  await page.getByText("No matching capitals. Try another search or continent.", { exact: true }).waitFor();
  assert.equal(await page.locator(".capital-marker:not([hidden])").count(), 3);
  await button(page, "Clear search").click();
  assert.equal(await originalMarker.evaluate(el => el.isConnected), true);
  await chooseContinent(page, "");

  // Repeated selections after real container resizes are the core mobile risk.
  for (const [width, height] of [[390, 844], [320, 568], [667, 375]]) {
    await page.setViewportSize({ width, height }); await showView(page, "Map"); await mapSettled(page);
    await page.emulateMedia({ reducedMotion: width === 390 ? "no-preference" : "reduce" });
    for (const name of ["Prague", "Berlin", "Berlin"]) {
      await open(name, name === "Berlin" ? "Germany" : "Czechia");
      assert.equal(await page.getByRole("tab", { name: "Map", exact: true }).getAttribute("aria-selected"), "true");
      assert.equal(await marker(page, name, name === "Berlin" ? "Germany" : "Czechia").getAttribute("aria-pressed"), "true");
    }
    await focused(button(page, "Red marker")); await reachable(button(page, "Red marker"));
    const beforeTabs = await positions(page);
    await showView(page, "Capitals"); await search.fill("Berlin"); await chooseContinent(page, "Europe");
    assert.equal(await page.locator(".mapboxgl-canvas").evaluate(el => { el.focus(); return el === document.activeElement; }), false);
    await showView(page, "Map"); await mapSettled(page);
    assert.deepEqual(await positions(page), beforeTabs);
    await button(page, "Red marker").focus(); await page.keyboard.press("Escape"); await focused(marker(page, "Berlin", "Germany"));
    await marker(page, "Berlin", "Germany").press("Enter"); await focused(button(page, "Red marker"));
    await showView(page, "Capitals"); await button(page, "Clear search").click(); await chooseContinent(page, "");
    if (width === 390) {
      await page.locator(".list-content").evaluate(el => { el.scrollTop = 42; });
      const scroll = await page.locator(".list-content").evaluate(el => el.scrollTop);
      assert.ok(scroll > 0);
      await showView(page, "Map"); await showView(page, "Capitals");
      assert.equal(await page.locator(".list-content").evaluate(el => el.scrollTop), scroll);
    }
    await open(longName, defaults.at(-1).country);
    await reachable(button(page, "Gold marker"));
    await page.locator(".capital-popup").evaluate(el => { el.scrollTop = 0; });
    await reachable(page.locator(".popup-actions-trigger"));
    await popupFits(page); await noOverflow(page);
    assert.equal(await canvas.evaluate(el => el === document.querySelector(".mapboxgl-canvas")), true);
    assert.equal(await originalMarker.evaluate(el => el.isConnected), true);
    assert.equal(await page.locator(".capital-marker").evaluateAll(els => els.every(el => el.offsetWidth === 32 && el.offsetHeight === 32 && getComputedStyle(el).borderRadius === "0px")), true);
  }
  // Long content at enlarged text has a distinct clipping/scrolling risk.
  await page.setViewportSize({ width: 320, height: 568 });
  await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
  await open(); await reachable(page.locator('.color-swatch[aria-pressed="true"]')); await popupFits(page);
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.setViewportSize({ width: 1440, height: 900 }); await showView(page, "Map"); await mapSettled(page);
  await button(page, "Collapse sidebar").click(); await mapSettled(page);
  assert.equal(await canvas.evaluate(el => el.clientWidth === el.parentElement.clientWidth), true);
  await button(page, "Expand sidebar").click(); await mapSettled(page);

  // Real marker activation reveals the offscreen row without resetting query.
  await open(longName, defaults.at(-1).country); await page.keyboard.press("Escape");
  await page.locator(".list-content").evaluate(el => { el.scrollTop = 0; });
  await marker(page, longName, defaults.at(-1).country).click();
  await focused(button(page, "Teal marker"));
  assert.ok(await page.locator(".list-content").evaluate(el => el.scrollTop) > 0);
  await showView(page, "Map");

  // Popup action entry point, error preservation and confirmed country/coordinate
  // edits use the real shared forms, rather than replaying the API status matrix.
  await open();
  assert.deepEqual(await page.locator(".popup-facts dd").allTextContents(), ["Europe", "83,200,000", "Euro (EUR)"]);
  const view = await positions(page);
  await page.locator(".popup-actions-trigger").focus(); await page.keyboard.press("Enter"); await focused(button(page, "Edit"));
  await page.keyboard.press("Tab"); await focused(button(page, "Delete"));
  await page.keyboard.press("Escape"); await focused(page.locator(".popup-actions-trigger"));
  await action("Edit"); await page.keyboard.press("Escape"); await dialogClosed(page);
  assert.deepEqual(await positions(page), view);
  await action("Edit"); await field(page, "Capital name").fill("Updated Berlin");
  api.writeMode = 409;
  await button(page, "Save changes").click(); await page.locator("dialog").getByRole("alert").waitFor();
  assert.equal(await page.locator(".capital-popup h2").textContent(), "Berlin");
  api.writeMode = "hold";
  await button(page, "Save changes").click(); await page.getByText("Saving capital…", { exact: true }).waitFor();
  await page.keyboard.press("Escape"); assert.equal(await page.locator("dialog[open]").count(), 1);
  await api.release(); api.writeMode = "success"; await dialogClosed(page);
  await focused(page.locator(".popup-actions-trigger"));
  assert.equal(await page.locator(".capital-popup h2").textContent(), "Updated Berlin");
  assert.equal(await button(page, "Red marker").getAttribute("aria-pressed"), "true");
  assert.deepEqual(await positions(page), view);
  for (const [country, facts] of [["Japan", ["Asia", "123,000,000", "Japanese yen (JPY)"]], ["Unknown <img src=x onerror=alert(1)>", ["—", "—", "—"]]]) {
    await action("Edit"); await field(page, "Country name").fill(country); await button(page, "Save changes").click(); await dialogClosed(page);
    assert.deepEqual(await page.locator(".popup-facts dd").allTextContents(), facts);
    assert.equal(await page.locator(".popup-country").textContent(), country);
    assert.equal(await page.locator(".popup-country img").count(), 0);
  }
  await action("Edit"); await field(page, "Country name").fill("Germany"); await field(page, "Latitude").fill("48");
  await field(page, "Longitude").fill("12"); await button(page, "Save changes").click(); await dialogClosed(page); await mapSettled(page);
  assert.equal(await page.locator(".popup-coordinates").textContent(), "48.0000, 12.0000");
  assert.notDeepEqual(await positions(page), view);
  assert.equal(await originalMarker.evaluate(el => el.isConnected), true);

  await chooseContinent(page, "Europe"); await search.fill("Updated Berlin");
  await action("Edit"); await field(page, "Country name").fill("Japan"); await button(page, "Save changes").click(); await dialogClosed(page);
  await focused(button(page, "Add capital"));
  assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
  assert.equal(await marker(page, "Updated Berlin", "Japan").isDisabled(), true);
  assert.equal(await search.inputValue(), "Updated Berlin");
  await chooseContinent(page, ""); await button(page, "Clear search").click();
  await open("Updated Berlin", "Japan");
  assert.equal(await button(page, "Red marker").getAttribute("aria-pressed"), "true");
  await page.reload(); await mapSettled(page);
  await open("Updated Berlin", "Japan");
  assert.equal(await button(page, "Red marker").getAttribute("aria-pressed"), "true");
  await action("Delete"); api.writeMode = 500;
  await button(page, "Delete capital").click(); await page.locator("dialog").getByRole("alert").waitFor();
  assert.equal(await marker(page, "Updated Berlin", "Japan").count(), 1);
  api.writeMode = "success"; await button(page, "Delete capital").click(); await dialogClosed(page);
  await focused(button(page, "Add capital"));
  assert.equal(await marker(page, "Updated Berlin", "Japan").count(), 0);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);

  // A new record cannot inherit an obsolete color under a reused ID.
  await page.evaluate(key => { localStorage.setItem(key, JSON.stringify({ 100: "#946200" })); localStorage.setItem("foreign-app", "keep"); }, key);
  await chooseContinent(page, "Europe"); await button(page, "Add capital").click();
  await fillCapital(page, { name: "Manual map city", country: "Germany", latitude: 0, longitude: 0 });
  await button(page, "Create capital").click(); await dialogClosed(page);
  await row(page, "Manual map city", "Germany").waitFor();
  assert.equal(await marker(page, "Manual map city", "Germany").evaluate(el => el.style.backgroundColor), "rgb(33, 98, 120)");
  await open("Prague", "Czechia"); await button(page, "Purple marker").click();
  const beforeReset = await marker(page, "Prague", "Czechia").evaluate(el => el.style.transform), resetCanvas = await page.locator("canvas").elementHandle();
  api.writeMode = 500;
  await button(page, "Reset to default").click(); await button(page, "Reset capitals").click(); await page.locator("dialog").getByRole("alert").waitFor();
  assert.equal(await button(page, "Purple marker").getAttribute("aria-pressed"), "true");
  await button(page, "Cancel").click(); api.writeMode = "success";
  await search.fill("Berlin");
  await button(page, "Reset to default").click(); await button(page, "Reset capitals").click(); await dialogClosed(page); await mapSettled(page);
  assert.equal(await search.inputValue(), "Berlin"); assert.equal(await continentValue(page), "Europe");
  assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
  assert.equal(await marker(page, "Manual map city", "Germany").count(), 0);
  assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
  assert.equal(await page.evaluate(() => localStorage.getItem("foreign-app")), "keep");
  assert.equal(await resetCanvas.evaluate(el => el === document.querySelector("canvas")), true);
  // Prague kept its coordinates/ID, so it independently observes camera retention.
  assert.equal(await marker(page, "Prague", "Czechia").evaluate(el => el.style.transform), beforeReset);
  await button(page, "Clear search").click(); await chooseContinent(page, "");
  await open();
  const beforeCameraResetWrites = api.writes.length;
  await button(page, "Red marker").click(); await search.fill("Berlin"); await chooseContinent(page, "Europe");
  await button(page, "Reset map view").click(); await mapSettled(page);
  assert.equal(await search.inputValue(), "Berlin"); assert.equal(await continentValue(page), "Europe");
  assert.equal(await button(page, "Red marker").getAttribute("aria-pressed"), "true");
  assert.equal(api.writes.length, beforeCameraResetWrites);
  await search.fill(""); await chooseContinent(page, "");
  // Real browser storage failures, once each; unit tests own data parsing.
  for (const mode of ["block-storage", "block-storage-getter"]) {
    await page.evaluate(mode => sessionStorage.setItem(mode, "yes"), mode); await page.reload(); await mapSettled(page);
    await open(); await button(page, "Purple marker").click();
    await page.keyboard.press("Escape"); await open();
    assert.equal(await button(page, "Purple marker").getAttribute("aria-pressed"), "true");
    await page.evaluate(mode => sessionStorage.removeItem(mode), mode);
  }
  // Reads are caused only by the explicit reloads, never navigation/filter/color.
  assert.equal(api.reads, reads + 3);
  const attribution = page.locator(".mapboxgl-ctrl-attrib a").first(); await reachable(attribution);
  return { realMapbox: true, viewports: [1440, 390, 320, 667], selectionAndNavigation: true, popupCRUDAndFilters: true, colorPersistence: true };
}
