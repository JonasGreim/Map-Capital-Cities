/* global document, window, performance, innerWidth, URL, structuredClone */
import assert from "node:assert/strict";
import { showView, viewButton } from "./view-helpers.mjs";

// Real Mapbox and native controls in a fresh context. All API writes are mocked.
export async function verifyContinents(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(15_000);
  const defaults = [
    { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, continents: ["Europe"] },
    { id: 2, name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.69, continents: ["Asia"] },
    { id: 3, name: "Ankara", country: "Turkey", latitude: 39.93, longitude: 32.86, continents: ["Asia", "Europe"] },
    { id: 4, name: "Unknown", country: "Unknown", latitude: 0, longitude: 0, continents: null },
  ];
  let records;
  let nextId = 20;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/capital{,-reset,/*}", async route => {
    const request = route.request();
    const method = request.method();
    const path = new URL(request.url()).pathname;
    if (method === "GET") return route.fulfill({ json: records });
    if (path === "/capital-reset") {
      assert.deepEqual(request.postDataJSON(), { confirm: true });
      records = defaults.map(row => ({ ...row, id: row.id + 100 }));
      return route.fulfill({ json: records });
    }
    const id = Number(path.split("/").at(-1));
    if (method === "DELETE") {
      records = records.filter(row => row.id !== id);
      return route.fulfill({ status: 204 });
    }
    const input = request.postDataJSON();
    assert.deepEqual(Object.keys(input).sort(), ["country", "latitude", "longitude", "name"]);
    const saved = { ...input, id: method === "POST" ? nextId++ : id,
      continents: defaults.find(row => row.country === input.country)?.continents ?? null };
    records = [...records.filter(row => row.id !== saved.id), saved];
    return route.fulfill({ status: method === "POST" ? 201 : 200, json: saved });
  });
  const button = name => viewButton(page, name);
  const visibleMarkers = () => page.locator(".capital-marker:not([hidden])");
  const sidebarNames = () => page.locator(".capital-name").allTextContents();
  const camera = () => page.evaluate(() => ({ center: window.filterMap.getCenter().toArray(), zoom: window.filterMap.getZoom(), flights: window.filterFlights }));
  const state = () => page.evaluate(async () => {
    const { useCapitalStore } = await import("/src/capital-store.ts");
    const { capitals, selectedCapitalId, continent } = useCapitalStore.getState();
    return { capitals, selectedCapitalId, continent };
  });
  const evidence = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    records = structuredClone(defaults);
    await page.setViewportSize({ width, height });
    await page.goto(baseURL);
    await page.locator(".capital-marker").nth(3).waitFor();
    await page.evaluate(async () => {
      const path = performance.getEntriesByType("resource").find(entry => entry.name.includes("/mapbox-gl.js?")).name;
      const { default: mapbox } = await import(path);
      const flyTo = mapbox.Map.prototype.flyTo;
      window.filterFlights = 0;
      mapbox.Map.prototype.flyTo = function (...args) { window.filterMap = this; window.filterFlights++; return flyTo.apply(this, args); };
      window.filterCanvas = document.querySelector(".mapboxgl-canvas");
      window.filterMarkers = [...document.querySelectorAll(".capital-marker")];
    });
    const select = page.getByRole("combobox", { name: "Continent", exact: true, includeHidden: true });
    const search = page.getByRole("searchbox", { includeHidden: true });
    // Native keyboard selection: All, Africa, Antarctica, Asia, Europe.
    await showView(page, "Capitals"); await select.focus();
    await page.keyboard.press("Home");
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter");
    assert.equal(await select.inputValue(), "Europe");
    assert.equal(await page.evaluate(() => window.filterFlights), 0);
    await showView(page, "Capitals"); await select.selectOption("");
    await showView(page, "Capitals"); await button("Show Berlin, Germany on map").click();
    await showView(page, "Map"); await button("Red marker").click();
    await page.waitForFunction(() => window.filterMap && !window.filterMap.isMoving());
    const before = await camera();
    await showView(page, "Capitals"); await search.fill("  BERLIN  ");
    assert.deepEqual(await sidebarNames(), ["Berlin"]);
    assert.equal(await visibleMarkers().count(), 4);
    await showView(page, "Capitals"); await search.fill("Tokyo");
    assert.deepEqual(await sidebarNames(), ["Tokyo"]);
    assert.equal((await state()).selectedCapitalId, 1);
    assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");
    assert.deepEqual(await camera(), before);
    await showView(page, "Capitals"); await search.fill("");

    await showView(page, "Capitals"); await select.selectOption("Europe");
    assert.deepEqual(await sidebarNames(), ["Berlin", "Ankara"]);
    assert.equal(await visibleMarkers().count(), 2);
    await showView(page, "Capitals"); await search.fill("Tokyo");
    await page.getByText("No matching capitals. Try another search or continent.", { exact: true }).waitFor();
    assert.equal(await page.locator("#search-results-count").textContent(), "0 of 4 capitals");
    assert.equal(await visibleMarkers().count(), 2);
    assert.equal((await state()).selectedCapitalId, 1);
    assert.deepEqual(await camera(), before);
    await showView(page, "Capitals"); await select.focus();
    await showView(page, "Capitals"); await select.selectOption("Asia");
    assert.deepEqual(await sidebarNames(), ["Tokyo"]);
    assert.equal(await visibleMarkers().count(), 2);
    assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
    assert.equal((await state()).selectedCapitalId, null);
    assert.equal(await select.evaluate(el => document.activeElement === el), true);
    const hiddenBerlin = page.locator('.capital-marker[aria-label^="Berlin,"]');
    assert.equal(await hiddenBerlin.isVisible(), false);
    assert.equal(await hiddenBerlin.isDisabled(), true);
    assert.equal(await hiddenBerlin.getAttribute("tabindex"), "-1");
    assert.equal(await hiddenBerlin.evaluate(el => { el.focus(); el.click(); return document.activeElement === el; }), false);
    assert.equal((await state()).selectedCapitalId, null);
    assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
    assert.deepEqual(await camera(), before);
    assert.deepEqual((await state()).capitals, defaults);

    await showView(page, "Capitals"); await search.fill("");
    for (const value of ["Europe", "Asia", "Europe", ""]) { await showView(page, "Capitals"); await select.selectOption(value); }
    assert.equal(await visibleMarkers().count(), 4);
    assert.equal(await page.evaluate(() => window.filterMarkers.every((el, i) => el === document.querySelectorAll(".capital-marker")[i])), true);
    assert.equal(await hiddenBerlin.evaluate(el => el.style.backgroundColor), "rgb(180, 35, 24)");
    assert.deepEqual(await camera(), before);
    await button("Collapse sidebar").click();
    assert.equal(await select.isVisible(), false);
    await button("Expand sidebar").click();
    assert.equal(await select.isVisible(), true);
    await showView(page, "Capitals"); await button("Show Berlin, Germany on map").click();
    assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
    assert.equal(await hiddenBerlin.evaluate(el => el === document.activeElement), true);

    // Country edit hides the selected marker but retains its instance/color.
    await showView(page, "Capitals"); await select.selectOption("Europe");
    await showView(page, "Capitals"); await button("Show Berlin, Germany on map").click();
    await showView(page, "Capitals"); await button("Actions for Berlin").click();
    await button("Edit").click();
    await page.getByRole("textbox", { name: "Country name", exact: true }).fill("Japan");
    await button("Save changes").click();
    await page.getByRole("dialog", { name: "Edit capital", exact: true }).waitFor({ state: "hidden" });
    assert.equal(await visibleMarkers().count(), 1);
    assert.equal((await state()).selectedCapitalId, null);
    assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
    await showView(page, "Capitals"); await select.selectOption("");
    assert.equal(await page.locator('.capital-marker[aria-label^="Berlin,"]').evaluate(el => el.style.backgroundColor), "rgb(180, 35, 24)");
    await showView(page, "Capitals"); await select.selectOption("Europe");

    for (const [name, country, shown] of [["Known city", "Germany", true], ["Unknown city", "Atlantis", false]]) {
      await showView(page, "Capitals"); await button("Add capital").click();
      await page.getByRole("textbox", { name: "Capital name", exact: true }).fill(name);
      await page.getByRole("textbox", { name: "Country name", exact: true }).fill(country);
      await page.getByRole("spinbutton", { name: "Latitude", exact: true }).fill("10");
      await page.getByRole("spinbutton", { name: "Longitude", exact: true }).fill("20");
      await button("Create capital").click();
      await page.getByRole("dialog", { name: "Add capital", exact: true }).waitFor({ state: "hidden" });
      assert.equal(await button(`Actions for ${name}`).count(), shown ? 1 : 0);
      await showView(page, "Map");
      assert.equal(await page.locator(`.capital-marker[aria-label^="${name},"]`).isVisible(), shown);
    }
    await showView(page, "Capitals"); await button("Actions for Known city").click();
    await button("Delete").click();
    await page.getByRole("dialog").getByRole("button", { name: "Delete capital", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await page.locator('.capital-marker[aria-label^="Known city,"]').count(), 0);
    await showView(page, "Capitals"); await search.fill("Berlin");
    await page.waitForFunction(() => !window.filterMap.isMoving());
    const beforeReset = await camera();
    await showView(page, "Capitals"); await button("Reset to default").click();
    await button("Reset capitals").click();
    await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(await select.inputValue(), "Europe");
    assert.equal(await search.inputValue(), "Berlin");
    assert.deepEqual(await sidebarNames(), ["Berlin"]);
    assert.equal(await visibleMarkers().count(), 2);
    assert.deepEqual(await camera(), beforeReset);
    await showView(page, "Capitals"); await search.fill("");
    await showView(page, "Capitals"); await select.selectOption("");
    assert.equal(await visibleMarkers().count(), 4);
    await showView(page, "Map");
    assert.equal(await page.locator(".capital-marker").evaluateAll(elements => elements.every(el => el.offsetWidth === 32 && el.offsetHeight === 32 && el.style.backgroundColor === "rgb(33, 98, 120)")), true);
    assert.equal(await page.evaluate(() => window.filterCanvas === document.querySelector(".mapboxgl-canvas")), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/continents-${width}.png`, fullPage: true });
    evidence.push({ width, keyboard: true, filterMatrix: true, colorAndIdentityPreserved: true, cameraStable: true, crudAndReset: true, overflow: false });
  }
  assert.deepEqual(errors, []);
  return { viewports: evidence, pageErrors: errors };
}
