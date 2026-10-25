/* global window, document, HTMLCanvasElement, requestAnimationFrame */
import assert from "node:assert/strict";

// Use a fresh isolated Playwright Page for each mode. Only the two Vite modules
// are instrumented, to inspect the real effect's listeners and unmount its root;
// production code has no test API. All capital traffic stays mocked.
export async function verifyMapErrors(page, baseURL, mode = "success") {
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const capital = { id: 1, name: "Prague", country: "Czechia", latitude: 50.0755, longitude: 14.4378 };
  await page.route("**/capital{,/*}", route => {
    assert.equal(route.request().method(), "GET");
    return route.fulfill({ json: [capital] });
  });
  await page.route("**/src/main.tsx", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const root = 'createRoot(document.getElementById("root"))';
    assert.ok(source.includes(root), "Expected Vite's React root initialization");
    await route.fulfill({ response, body: source.replace(root, `(window.mapErrorTestRoot = ${root})`) });
  });
  function inspectMap(map) {
    const types = ["error", "style.load", "webglcontextlost", "webglcontextrestored"];
    const listeners = new globalThis.Map(types.map(type => [type, new Set()]));
    const on = map.on.bind(map);
    const off = map.off.bind(map);
    map.on = (type, listener, ...args) => {
      listeners.get(type)?.add(listener);
      return on(type, listener, ...args);
    };
    map.off = (type, listener, ...args) => {
      listeners.get(type)?.delete(listener);
      return off(type, listener, ...args);
    };
    window.mapErrorTestMap = map;
    window.mapErrorTestListeners = () => Object.fromEntries([...listeners].map(([type, set]) => [type, set.size]));
  }
  await page.route("**/src/Map.tsx", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const marker = "const failed =";
    assert.ok(source.includes(marker), "Expected the map error listener initialization");
    await route.fulfill({ response, body: source.replace(marker, `(${inspectMap.toString()})(map);\n${marker}`) });
  });
  let rejectStyle = mode === "initial-style-error";
  if (rejectStyle) {
    await page.route("https://api.mapbox.com/styles/v1/mapbox/streets-v12?*", route => rejectStyle
      ? route.fulfill({ status: 503, json: { message: "Controlled style request failure" } }) : route.continue());
  }
  if (mode === "construction-error") {
    await page.addInitScript(() => {
      const getContext = HTMLCanvasElement.prototype.getContext;
      HTMLCanvasElement.prototype.getContext = function (type, ...args) {
        return type.includes("webgl") ? null : getContext.call(this, type, ...args);
      };
    });
  }
  const unavailable = "Map could not load. Check your Mapbox token and connection. The capital list is still available.";
  const resources = "Map resources could not load. Check your Mapbox token and connection. The capital list is still available.";
  const warning = page.locator(".map-error");
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await page.goto(baseURL);
  await page.getByRole("button", { name: "Actions for Prague", exact: true }).waitFor();
  if (mode === "construction-error") {
    await page.getByText(unavailable, { exact: true }).waitFor();
    assert.equal(await page.evaluate(() => window.mapErrorTestMap === undefined), true);
    await page.getByRole("button", { name: "Actions for Prague", exact: true }).click();
    await page.getByRole("button", { name: "Edit", exact: true }).click();
    await page.getByRole("dialog", { name: "Edit capital", exact: true }).waitFor();
    assert.equal(await page.getByRole("button", { name: "Pick on map", exact: true }).isDisabled(), true);
    await page.getByLabel("Latitude", { exact: true }).fill("0");
    assert.equal(await page.getByLabel("Latitude", { exact: true }).inputValue(), "0");
    await page.keyboard.press("Escape");
  } else {
    await page.waitForFunction(() => !!window.mapErrorTestMap);
    assert.deepEqual(await page.evaluate(() => window.mapErrorTestListeners()), {
      error: 1, "style.load": 1, webglcontextlost: 1, webglcontextrestored: 1,
    });
    if (mode === "initial-style-error") {
      await page.getByText(resources, { exact: true }).waitFor();
      assert.equal(await page.getByText(unavailable, { exact: true }).count(), 0);
      await page.getByRole("button", { name: "Add capital", exact: true }).click();
      assert.equal(await page.getByRole("button", { name: "Pick on map", exact: true }).isDisabled(), true);
      await page.keyboard.press("Escape");
    } else {
      await page.waitForFunction(() => window.mapErrorTestMap.loaded());
      assert.equal(await warning.count(), 0);
    }
    // Use the actual browser/Mapbox context loss and restoration lifecycle.
    await page.evaluate(() => {
      window.mapErrorTestContext = window.mapErrorTestMap.getCanvas().getContext("webgl2").getExtension("WEBGL_lose_context");
      if (!window.mapErrorTestContext) throw new Error("WEBGL_lose_context is required for this regression");
      window.mapErrorTestContext.loseContext();
    });
    await page.getByText(unavailable, { exact: true }).waitFor();
    await page.evaluate(() => window.mapErrorTestMap.fire("error", { error: new Error("Controlled resource error during context loss") }));
    await frame();
    assert.equal(await warning.textContent().then(text => text.trim()), unavailable);
    await page.evaluate(() => window.mapErrorTestContext.restoreContext());
    await page.waitForFunction(() => !window.mapErrorTestMap.getCanvas().getContext("webgl2").isContextLost());
    if (mode === "initial-style-error") {
      // Renderer recovery alone cannot establish recovery of the failed style.
      await page.getByText(resources, { exact: true }).waitFor();
      rejectStyle = false;
      await page.evaluate(() => window.mapErrorTestMap.setStyle("mapbox://styles/mapbox/streets-v12", { diff: false }));
    }
    await page.waitForFunction(() => window.mapErrorTestMap.loaded());
    await warning.waitFor({ state: "hidden" });
    const canvas = await page.locator(".mapboxgl-canvas").elementHandle();
    // Generic events carry no severity; an individual tile/source error after
    // initialization must never turn the whole map into a failed-map banner.
    await page.evaluate(() => window.mapErrorTestMap.fire("error", { error: new Error("Controlled recoverable tile error"), sourceId: "test-source", tile: {} }));
    await frame();
    assert.equal(await warning.count(), 0);
    await page.getByRole("button", { name: "Show Prague, Czechia on map", exact: true }).click();
    await page.getByRole("dialog", { name: "Prague, Czechia: marker color", exact: true }).waitFor();
    await page.waitForFunction(() => !window.mapErrorTestMap.isMoving());
    assert.equal(await canvas.evaluate(el => el === document.querySelector(".mapboxgl-canvas")), true);
    await page.keyboard.press("Escape");
    const beforeZoom = await page.evaluate(() => window.mapErrorTestMap.getZoom());
    await page.locator(".mapboxgl-canvas").hover();
    await page.mouse.wheel(0, -200);
    await page.waitForFunction(zoom => window.mapErrorTestMap.getZoom() > zoom, beforeZoom);
    assert.equal(await warning.count(), 0);
  }
  await page.evaluate(() => window.mapErrorTestRoot.unmount());
  await frame();
  if (mode !== "construction-error") assert.deepEqual(await page.evaluate(() => window.mapErrorTestListeners()), {
    error: 0, "style.load": 0, webglcontextlost: 0, webglcontextrestored: 0,
  });
  assert.equal(await page.locator(".mapboxgl-canvas").count(), 0);
  assert.deepEqual(pageErrors, []);
  return { mode, lifecycle: true, cleanup: true, pageErrors };
}
