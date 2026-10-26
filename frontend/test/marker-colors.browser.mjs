import { chooseContinent } from "./continent-helpers.mjs";
/* global document, window, localStorage, sessionStorage, Storage, innerWidth, URL */
import assert from "node:assert/strict";
import { showView, viewButton } from "./view-helpers.mjs";

// Real Chromium/Mapbox; intercept every capital request, including all writes.
export async function verifyMarkerColors(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(15_000);
  const key = "map-capital-cities.marker-colors.v1";
  const defaults = [
    { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, continents: ["Europe"] },
    { id: 2, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, continents: ["Europe"] },
    { id: 3, name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.69, continents: ["Asia"] },
  ];
  let records = defaults.map(capital => ({ ...capital }));
  let failure = false;
  let writes = 0;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !/Failed to load resource: the server responded with a status of 500/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/capital{,-reset,/*}", async route => {
    const request = route.request(), method = request.method();
    if (method === "GET") return route.fulfill({ json: records });
    writes++;
    if (failure) return route.fulfill({ status: 500, json: {} });
    const path = new URL(request.url()).pathname;
    if (path === "/capital-reset") {
      assert.deepEqual(request.postDataJSON(), { confirm: true });
      // Reuse IDs deliberately to prove storage cleanup, independently of ID churn.
      records = defaults.map(capital => ({ ...capital }));
      return route.fulfill({ json: records });
    }
    const id = method === "POST" ? 4 : Number(path.split("/").at(-1));
    if (method === "DELETE") {
      records = records.filter(capital => capital.id !== id);
      return route.fulfill({ status: 204 });
    }
    const input = request.postDataJSON();
    assert.deepEqual(Object.keys(input).sort(), ["country", "latitude", "longitude", "name"]);
    const saved = { ...records.find(capital => capital.id === id), ...input, id };
    records = [...records.filter(capital => capital.id !== id), saved];
    return route.fulfill({ json: saved, status: method === "POST" ? 201 : 200 });
  });
  await page.route("**/src/Map.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    assert.ok(source.includes("const capitalMarkers ="));
    await route.fulfill({ response, body: source.replace("const capitalMarkers =", `
      window.colorMap = map;
      window.colorMaps = (window.colorMaps || 0) + 1;
      window.colorFlights = 0;
      const fly = map.flyTo.bind(map);
      map.flyTo = (...args) => { window.colorFlights++; return fly(...args); };
      const capitalMarkers =`) });
  });
  await page.addInitScript(() => {
    const mode = sessionStorage.getItem("color-storage-failure");
    if (mode === "getter") Object.defineProperty(window, "localStorage", { configurable: true, get() { throw new Error("SecurityError"); } });
    if (mode === "write") {
      Storage.prototype.setItem = () => { throw new Error("QuotaExceededError"); };
      Storage.prototype.removeItem = () => { throw new Error("SecurityError"); };
    }
  });
  const button = name => viewButton(page, name);
  const marker = id => {
    const capital = records.find(capital => capital.id === id);
    return page.getByRole("button", { name: `${capital.name}, ${capital.country}: change marker color`, exact: true, includeHidden: true });
  };
  const ready = () => page.locator(".capital-marker").nth(records.length - 1).waitFor({ state: "attached" });
  const stored = () => page.evaluate(key => JSON.parse(localStorage.getItem(key) ?? "{}"), key);
  const color = id => marker(id).evaluate(el => el.style.backgroundColor);
  const settled = () => page.waitForFunction(() => !window.colorMap.isMoving());
  const camera = () => page.evaluate(() => ({ center: window.colorMap.getCenter().toArray(), zoom: window.colorMap.getZoom(), flights: window.colorFlights }));
  const open = async id => {
    const capital = records.find(capital => capital.id === id);
    await showView(page, "Capitals"); await button(`Show ${capital.name}, ${capital.country} on map`).click();
    await page.locator(".popup-actions-trigger").waitFor();
    await settled();
  };
  const swatch = async name => {
    await button(`${name} marker`).click();
    assert.equal(await button(`${name} marker`).getAttribute("aria-pressed"), "true");
  };
  const action = async name => {
    await page.locator(".popup-actions-trigger").click();
    await button(name).click();
    await page.locator("dialog.capital-dialog").waitFor();
  };
  const closeDialog = () => page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  const reload = async () => { await page.reload(); await ready(); };
  const evidence = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    records = defaults.map(capital => ({ ...capital }));
    await page.setViewportSize({ width, height });
    await page.goto(baseURL); await ready();
    await page.evaluate(key => { localStorage.removeItem(key); localStorage.setItem("foreign-app", "keep"); }, key);
    await reload();
    const before = writes;
    await open(1); await swatch("Red");
    await open(2); await swatch("Purple");
    assert.equal(writes, before, "color selection sends no HTTP writes");
    assert.deepEqual(await stored(), { 1: "#b42318", 2: "#6941c6" });
    await reload();
    assert.equal(await color(1), "rgb(180, 35, 24)");
    assert.equal(await color(2), "rgb(105, 65, 198)");
    assert.equal(await color(3), "rgb(33, 98, 120)");
    await open(1);
    assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");
    await open(2);
    assert.equal(await button("Purple marker").getAttribute("aria-pressed"), "true");
    await page.evaluate(() => {
      window.originalColorMap = window.colorMap;
      window.originalColorCanvas = document.querySelector(".mapboxgl-canvas");
      window.originalColorMarkers = [...document.querySelectorAll(".capital-marker")];
    });
    const view = await camera();
    await showView(page, "Capitals"); await chooseContinent(page, "Asia");
    assert.equal(await marker(1).isHidden(), true);
    await showView(page, "Capitals"); await chooseContinent(page, "");
    const search = page.getByRole("searchbox", { includeHidden: true });
    await showView(page, "Capitals"); await search.fill("Tokyo");
    assert.equal(await color(1), "rgb(180, 35, 24)");
    await button("Clear search").click();
    await page.evaluate(async () => {
      const { useCapitalStore } = await import("/src/capital-store.ts");
      await useCapitalStore.getState().fetchCapitals();
    });
    assert.deepEqual(await camera(), view);
    assert.equal(await page.evaluate(() => window.originalColorMarkers.every(el => el.isConnected)), true);
    await open(1); await action("Edit");
    await page.getByLabel("Capital name", { exact: true }).fill("Berlin edited");
    await page.getByLabel("Country name", { exact: true }).fill("Germany edited");
    await page.getByLabel("Latitude", { exact: true }).fill("51");
    await button("Save changes").click(); await closeDialog(); await settled();
    assert.equal(await color(1), "rgb(180, 35, 24)");
    assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");
    await action("Delete"); failure = true;
    await button("Delete capital").click();
    await page.locator("dialog.capital-dialog").getByRole("alert").waitFor();
    assert.deepEqual(await stored(), { 1: "#b42318", 2: "#6941c6" });
    failure = false;
    await button("Delete capital").click(); await closeDialog();
    assert.deepEqual(await stored(), { 2: "#6941c6" });
    assert.equal(await page.evaluate(() => window.originalColorMap === window.colorMap
      && window.originalColorCanvas === document.querySelector(".mapboxgl-canvas") && window.colorMaps === 1), true);
    await reload();
    await page.evaluate(() => {
      window.originalColorMap = window.colorMap;
      window.originalColorCanvas = document.querySelector(".mapboxgl-canvas");
    });
    assert.equal(await page.locator(".capital-marker").count(), 2);
    assert.deepEqual(await stored(), { 2: "#6941c6" });
    // Confirmed create must not inherit an obsolete entry with a reused ID.
    await page.evaluate(key => {
      const colors = JSON.parse(localStorage.getItem(key)); colors[4] = "#946200"; localStorage.setItem(key, JSON.stringify(colors));
    }, key);
    await showView(page, "Capitals"); await button("Add capital").click();
    for (const [label, value] of [["Capital name", "New capital"], ["Country name", "New country"], ["Latitude", "0"], ["Longitude", "0"]]) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
    await button("Create capital").click(); await closeDialog();
    assert.equal(await color(4), "rgb(33, 98, 120)");
    assert.deepEqual(await stored(), { 2: "#6941c6" });
    await open(2); await swatch("Teal");
    assert.deepEqual(await stored(), {});
    await swatch("Purple"); await open(3); await swatch("Gold");
    const resetView = await camera();
    failure = true;
    await showView(page, "Capitals"); await button("Reset to default").click(); await button("Reset capitals").click();
    await page.locator("dialog.capital-dialog").getByRole("alert").waitFor();
    assert.deepEqual(await stored(), { 2: "#6941c6", 3: "#946200" });
    assert.equal(await color(3), "rgb(148, 98, 0)");
    await button("Cancel").click(); failure = false;
    await showView(page, "Capitals"); await button("Reset to default").click(); await button("Reset capitals").click(); await closeDialog();
    assert.deepEqual(await camera(), resetView);
    assert.deepEqual(await stored(), {});
    assert.equal(await page.evaluate(key => localStorage.getItem(key), key), null);
    assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
    assert.equal(await page.evaluate(() => window.originalColorMap === window.colorMap
      && window.originalColorCanvas === document.querySelector(".mapboxgl-canvas") && window.colorMaps === 1), true);
    await reload();
    assert.equal(await page.locator(".capital-marker").evaluateAll(elements => elements.every(el => el.style.backgroundColor === "rgb(33, 98, 120)")), true);
    assert.equal(await page.evaluate(() => localStorage.getItem("foreign-app")), "keep");
    for (const mode of ["getter", "write"]) {
      await page.evaluate(mode => sessionStorage.setItem("color-storage-failure", mode), mode);
      await reload();
      await open(1); await swatch("Red");
      await button("Close popup").click();
      await showView(page, "Capitals"); await chooseContinent(page, "Asia"); await showView(page, "Capitals"); await chooseContinent(page, "");
      await open(1);
      assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");
      assert.equal(await color(1), "rgb(180, 35, 24)");
      await action("Edit"); await button("Save changes").click(); await closeDialog();
      assert.equal(await color(1), "rgb(180, 35, 24)");
      await showView(page, "Capitals"); await button("Reset to default").click(); await button("Reset capitals").click(); await closeDialog();
      assert.equal(await color(1), "rgb(33, 98, 120)");
      await page.evaluate(() => delete sessionStorage["color-storage-failure"]);
      await reload();
    }
    assert.equal(await page.locator(".capital-marker").evaluateAll(elements => elements.every(el => el.offsetWidth === 32 && el.offsetHeight === 32)), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await open(1);
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/marker-colors-${width}.png`, fullPage: true });
    evidence.push({ width, height, reload: true, swatches: true, filterAndSearch: true, crud: true, resetSuccessAndFailure: true,
      storageFailures: ["getter", "write"], stableMapAndCamera: true, markerSize: "32x32", overflow: false });
  }
  assert.deepEqual(errors, []);
  return { viewports: evidence, mockedWrites: writes, pageErrors: errors };
}
