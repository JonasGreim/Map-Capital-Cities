/* global document, window, performance, innerWidth, getComputedStyle */
import assert from "node:assert/strict";

// Run with a fresh isolated Playwright Page and a real Mapbox token/network.
// Only capital API traffic is mocked; no development DB is read or modified.
export async function verifyMapSelection(page, baseURL, screenshotDirectory) {
  const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
  const prague = { id: 2, name: "Prague", country: "Czechia", latitude: 50.0755, longitude: 14.4378 };
  let records = [berlin, ...Array.from({ length: 25 }, (_, i) => ({ id: i + 3, name: `Capital ${i}`, country: `Country ${i}`, latitude: -30, longitude: -60 + i })), prague];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => { if (message.type() === "error") errors.push(message.text()); });
  await page.route("**/capital{,/*}", route => {
    const request = route.request();
    const method = request.method();
    if (method === "GET") return route.fulfill({ json: records });
    const id = Number(request.url().split("/").pop());
    if (method === "DELETE") {
      records = records.filter(record => record.id !== id);
      return route.fulfill({ status: 204 });
    }
    const saved = { ...request.postDataJSON(), id };
    records = records.map(record => record.id === id ? saved : record);
    return route.fulfill({ json: saved });
  });
  await page.goto(baseURL);
  await page.locator(".capital-marker").first().waitFor();
  await page.evaluate(async () => {
    // Observe the real Mapbox class used by Vite, without an app debug API.
    const path = performance.getEntriesByType("resource").find(entry => entry.name.includes("/mapbox-gl.js?")).name;
    const { default: mapbox } = await import(path);
    const flyTo = mapbox.Map.prototype.flyTo;
    window.selectionFlights = [];
    mapbox.Map.prototype.flyTo = function (options, ...rest) {
      window.selectionFlights.push({ center: options.center, duration: options.duration, zoom: options.zoom });
      window.selectionMap = this;
      return flyTo.call(this, options, ...rest);
    };
    window.selectionCanvas = document.querySelector(".mapboxgl-canvas");
    window.originalMarkers = [...document.querySelectorAll(".capital-marker")];
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const row = name => button(`Show ${name}, ${name === "Berlin" ? "Germany" : "Czechia"} on map`);
  const marker = name => button(`${name}, ${name === "Berlin" ? "Germany" : "Czechia"}: change marker color`);
  const popup = name => page.getByRole("dialog", { name: `${name}, ${name === "Berlin" ? "Germany" : "Czechia"}: marker color`, exact: true });
  const search = page.getByRole("searchbox");
  const focused = async locator => { assert.equal(await locator.evaluate(el => el === document.activeElement), true); };
  const settled = async () => { await page.waitForFunction(() => window.selectionMap && !window.selectionMap.isMoving()); };
  const countFlights = () => page.evaluate(() => window.selectionFlights.length);
  const evidence = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    // Viewport changes resolve before ResizeObserver/Mapbox update the canvas.
    // A flight started with the previous canvas size can finish off target.
    await page.waitForFunction(() => {
      const canvas = document.querySelector(".mapboxgl-canvas");
      const map = document.querySelector(".map");
      return canvas && map && canvas.clientWidth === map.clientWidth && canvas.clientHeight === map.clientHeight
        && (!window.selectionMap || !window.selectionMap.isMoving());
    });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await search.fill("Prague");
    await row("Prague").focus();
    await page.keyboard.press("Enter");
    await popup("Prague").waitFor();
    await focused(button(width === 1440 ? "Teal marker" : "Red marker"));
    assert.equal(await row("Prague").getAttribute("aria-pressed"), "true");
    await settled();
    const camera = await page.evaluate(() => ({ flight: window.selectionFlights.at(-1), point: window.selectionMap.project([14.4378, 50.0755]), height: window.selectionMap.getContainer().clientHeight }));
    assert.deepEqual(camera.flight.center, [14.4378, 50.0755]);
    assert.ok(camera.point.y > 200 && camera.point.y < camera.height - 15, JSON.stringify({ width, camera }));
    await button("Teal marker").focus();
    await page.keyboard.press("Tab");
    await focused(button("Red marker"));
    await page.keyboard.press("Space");
    await page.keyboard.press("Escape");
    await focused(marker("Prague"));
    assert.equal(await page.locator("li[data-selected]").count(), 0);
    await row("Prague").focus();
    await page.keyboard.press("Space");
    await focused(button("Red marker"));
    await button("Close popup").click();
    await focused(marker("Prague"));
    await search.fill("");
    // Interrupt the first animation, then activate the same city again.
    await row("Berlin").click();
    await row("Prague").click();
    await row("Prague").click();
    await settled();
    assert.equal(await page.locator(".mapboxgl-popup").count(), 1);
    assert.equal(await marker("Berlin").getAttribute("aria-pressed"), "false");
    assert.equal(await marker("Prague").getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
    const beforeActions = await countFlights();
    await button("Actions for Berlin").click();
    await button("Edit").click();
    await page.keyboard.press("Escape");
    await button("Actions for Berlin").click();
    await button("Delete").click();
    await button("Cancel").click();
    assert.equal(await countFlights(), beforeActions);
    // Direct marker activation synchronizes and reveals the offscreen row,
    // scrolling only the results region, without taking focus from the popup.
    await row("Berlin").click();
    await settled();
    await page.keyboard.press("Escape");
    await page.locator(".list-content").evaluate(el => { el.scrollTop = 0; });
    await marker("Prague").click();
    await focused(button("Red marker"));
    assert.equal(await row("Prague").getAttribute("aria-pressed"), "true");
    assert.ok(await page.locator(".list-content").evaluate(el => el.scrollTop) > 0);
    await search.fill("Berlin");
    await marker("Prague").focus();
    await page.keyboard.press("Enter");
    assert.equal(await search.inputValue(), "Berlin");
    assert.equal(await page.locator("li[data-selected]").count(), 0);
    await button("Collapse sidebar").click();
    await marker("Prague").focus();
    await page.keyboard.press("Enter");
    assert.equal(await page.locator("#capital-sidebar").isVisible(), false);
    await button("Expand sidebar").click();
    assert.equal(await search.inputValue(), "Berlin");
    await search.fill("");
    await page.emulateMedia({ reducedMotion: "reduce" });
    await row("Prague").click();
    await settled();
    assert.equal(await page.evaluate(() => window.selectionFlights.at(-1).duration), 0);
    const geometry = await page.evaluate(() => {
      const map = document.querySelector(".map").getBoundingClientRect();
      const popup = document.querySelector(".mapboxgl-popup-content").getBoundingClientRect();
      return { fits: popup.top >= map.top && popup.left >= map.left && popup.right <= map.right && popup.bottom <= map.bottom,
        dimensions: [...document.querySelectorAll(".capital-marker")].every(el => el.offsetWidth === 32 && el.offsetHeight === 32 && getComputedStyle(el).borderRadius === "0px"),
        canvas: window.selectionCanvas === document.querySelector(".mapboxgl-canvas"),
        markers: window.originalMarkers.every(el => el.isConnected), overflow: document.documentElement.scrollWidth > innerWidth };
    });
    assert.deepEqual(geometry, { fits: true, dimensions: true, canvas: true, markers: true, overflow: false });
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/selection-${width}.png` });
    evidence.push({ width, height, ...geometry, keyboard: true, reducedMotion: true, menuDoesNotNavigate: true });
    await page.keyboard.press("Escape");
    // Pan and zoom still use the same actual Mapbox instance.
    const zoom = await page.evaluate(() => window.selectionMap.getZoom());
    await page.locator(".mapboxgl-canvas").hover();
    await page.mouse.wheel(0, -200);
    await page.waitForFunction(previous => window.selectionMap.getZoom() > previous, zoom);
    const canvasBounds = await page.locator(".mapboxgl-canvas").boundingBox();
    const centerX = canvasBounds.x + canvasBounds.width / 2;
    const centerY = canvasBounds.y + canvasBounds.height / 2;
    const longitude = await page.evaluate(() => window.selectionMap.getCenter().lng);
    await page.mouse.move(centerX, centerY);
    await page.mouse.down();
    await page.mouse.move(centerX + 50, centerY + 20, { steps: 8 });
    await page.mouse.up();
    await page.waitForFunction(previous => Math.abs(window.selectionMap.getCenter().lng - previous) > 0.01, longitude);
    // Movement alone is observable before drag inertia finishes. Keep the next
    // viewport scenario independent of that still-running gesture.
    await settled();
  }
  // Edit an active capital, then refresh and delete it, retaining colors and ID.
  await search.fill("Prague");
  await row("Prague").click();
  await button("Actions for Prague").click();
  await button("Edit").click();
  await page.getByLabel("Capital name", { exact: true }).fill("Updated Prague");
  await page.getByLabel("Latitude", { exact: true }).fill("49");
  await page.getByLabel("Longitude", { exact: true }).fill("15");
  await button("Save changes").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  await page.getByRole("heading", { name: "Updated Prague", exact: true }).waitFor();
  assert.equal(await button("Show Updated Prague, Czechia on map").getAttribute("aria-pressed"), "true");
  assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");
  assert.equal(await page.locator(".popup-coordinates").textContent(), "49.0000, 15.0000");
  assert.deepEqual(await page.evaluate(() => window.selectionFlights.at(-1).center), [15, 49]);
  const beforeRefresh = await countFlights();
  await button("Refresh list").click();
  await button("Actions for Updated Prague").waitFor();
  assert.equal(await countFlights(), beforeRefresh);
  assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");
  await button("Actions for Updated Prague").click();
  await button("Delete").click();
  await button("Delete capital").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
  assert.equal(await page.locator("li[data-selected]").count(), 0);
  await focused(button("Add capital"));
  assert.equal(await page.evaluate(() => window.selectionCanvas === document.querySelector(".mapboxgl-canvas")), true);
  assert.deepEqual(errors, []);
  return { viewports: evidence, selectedEditRefreshDelete: true, panZoom: true, consoleErrors: errors };
}
