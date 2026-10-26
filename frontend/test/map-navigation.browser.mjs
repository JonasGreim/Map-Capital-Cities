/* global window, document, getComputedStyle, innerWidth, innerHeight, localStorage */
import assert from "node:assert/strict";
import { URL } from "node:url";
import { chooseContinent, continentValue } from "./continent-helpers.mjs";
import { showView } from "./view-helpers.mjs";

// Real Mapbox in an isolated context. All capital requests use fixtures;
// Vite-only instrumentation keeps inspection APIs out of production code.
export async function verifyMapNavigation(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(20_000);
  const records = [
    { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, continents: ["Europe"] },
    { id: 2, name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.69, continents: ["Asia"] },
  ];
  const requests = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/capital{,-reset,/*}", route => {
    requests.push({ method: route.request().method(), url: new URL(route.request().url()).pathname });
    return route.fulfill({ json: records });
  });
  await page.route("**/src/Map.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    assert.ok(source.includes("const failed ="));
    await route.fulfill({ response, body: source.replace("const failed =", "window.navigationMap = map; window.navigationCreations = (window.navigationCreations || 0) + 1; const failed =") });
  });
  await page.route("**/src/capital-store.ts", async route => {
    const response = await route.fetch(), source = await response.text();
    await route.fulfill({ response, body: `${source}\nwindow.navigationStore = useCapitalStore;` });
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const idle = () => page.waitForFunction(() => window.navigationMap?.isStyleLoaded() && !window.navigationMap.isMoving()
    && window.navigationMap.getCanvas().clientWidth === window.navigationMap.getContainer().clientWidth);
  const camera = () => page.evaluate(() => {
    const map = window.navigationMap;
    return { center: map.getCenter().toArray(), zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
  });
  const assertZoom = async expected => assert.ok(Math.abs((await camera()).zoom - expected) < 1e-9);
  async function resetCamera() {
    const view = await camera();
    for (const [actual, expected] of [[view.center[0], 10], [view.center[1], 30], [view.zoom, 1.5], [view.bearing, 0], [view.pitch, 0]]) {
      assert.ok(Math.abs(actual - expected) < 0.00001, JSON.stringify(view));
    }
  }
  const focused = async locator => page.waitForFunction(el => el === document.activeElement, await locator.elementHandle());
  const shot = async name => { if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/${name}.png` }); };
  async function geometry() {
    const result = await page.locator(".map-navigation").evaluate(el => {
      const bounds = el.getBoundingClientRect(), panel = el.closest(".map-panel").getBoundingClientRect();
      const buttons = [...el.querySelectorAll("button")].map(button => {
        const box = button.getBoundingClientRect();
        return { width: box.width, height: box.height, title: button.title };
      });
      const group = el.firstElementChild.getBoundingClientRect(), reset = el.lastElementChild.getBoundingClientRect();
      return { top: bounds.top - panel.top, right: panel.right - bounds.right, gap: reset.top - group.bottom,
        onscreen: bounds.left >= panel.left && bounds.right <= innerWidth && bounds.bottom <= panel.bottom && bounds.bottom <= innerHeight,
        overflow: document.documentElement.scrollWidth > innerWidth, buttons };
    });
    assert.ok(result.top >= 12 && result.top <= 16 && result.right >= 12 && result.right <= 16, JSON.stringify(result));
    assert.ok(result.gap >= 8 && result.gap <= 12);
    assert.equal(result.onscreen, true); assert.equal(result.overflow, false);
    for (const item of result.buttons) assert.ok(item.width >= 40 && item.height >= 40 && item.title);
    return result;
  }
  async function clickRepeatedly(label, count) {
    await page.evaluate(({ label, count }) => {
      for (let i = 0; i < count; i++) document.querySelector(`.map-navigation [aria-label="${label}"]`).click();
    }, { label, count });
    await idle();
  }
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(baseURL);
  await page.waitForFunction(() => window.navigationMap?.isStyleLoaded());
  await button("Reset map view").waitFor(); await idle(); await resetCamera();
  await page.evaluate(() => {
    window.navigationCanvas = document.querySelector("canvas");
    window.navigationMarkers = [...document.querySelectorAll(".capital-marker")];
    window.navigationStyle = window.navigationMap.getStyle().name;
    window.navigationProjection = window.navigationMap.getProjection();
  });
  const initialRequests = [...requests], evidence = [];
  assert.ok(initialRequests.length > 0 && initialRequests.every(request => request.method === "GET"));
  for (const [width, height] of [[1440, 900], [1024, 768], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height }); await showView(page, "Map"); await idle();
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.evaluate(() => window.navigationMap.jumpTo({ center: [-70, -25], zoom: 5, bearing: 40, pitch: 45 }));
    await button("Reset map view").click(); await idle(); await resetCamera();
    await button("Zoom in").focus(); await page.keyboard.press("Enter");
    await idle(); await assertZoom(2.5);
    await page.keyboard.press("Tab"); await focused(button("Zoom out")); await page.keyboard.press("Space");
    await idle(); await assertZoom(1.5);
    await page.keyboard.press("Tab"); await focused(button("Reset map view"));
    assert.notEqual(await button("Reset map view").evaluate(el => getComputedStyle(el).outlineStyle), "none");
    await shot(`map-controls-focus-${width}`); await button("Zoom in").hover();
    assert.equal(await button("Zoom in").evaluate(el => getComputedStyle(el).backgroundColor), "rgb(234, 241, 243)");
    await shot(`map-controls-hover-${width}`);
    await clickRepeatedly("Zoom in", 3); await assertZoom(4.5);
    await clickRepeatedly("Zoom out", 3); await assertZoom(1.5);
    await page.evaluate(() => { window.navigationMap.setMinZoom(1); window.navigationMap.setMaxZoom(3.5); });
    await clickRepeatedly("Zoom in", 8); await assertZoom(3.5); assert.equal(await button("Zoom in").isDisabled(), true);
    await clickRepeatedly("Zoom out", 8); await assertZoom(1); assert.equal(await button("Zoom out").isDisabled(), true);
    await page.evaluate(() => { window.navigationMap.setMinZoom(0); window.navigationMap.setMaxZoom(22); });
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => window.navigationMap.jumpTo({ center: [-70, -25], zoom: 5, bearing: 40, pitch: 45 }));
    await button("Reset map view").click(); assert.equal(await page.evaluate(() => window.navigationMap.isMoving()), false); await resetCamera();
    await button("Zoom in").click(); assert.equal(await page.evaluate(() => window.navigationMap.isMoving()), false); await assertZoom(2.5);
    await button("Reset map view").click();
    await page.locator("canvas").hover(); await page.mouse.wheel(0, -150);
    await page.waitForFunction(() => window.navigationMap.getZoom() > 1.5); await idle();
    await button("Reset map view").click();
    await page.locator("canvas").focus(); await page.keyboard.press("ArrowRight"); await idle(); assert.notEqual((await camera()).center[0], 10);
    await button("Reset map view").click();
    await showView(page, "Capitals"); await page.getByRole("searchbox").fill("Berlin"); await chooseContinent(page, "Europe");
    await button("Show Berlin, Germany on map").click(); await idle(); await button("Red marker").click();
    await page.evaluate(() => {
      window.navigationBeforeReset = window.navigationStore.getState();
      window.navigationStorage = JSON.stringify(localStorage);
      window.navigationPopup = document.querySelector(".mapboxgl-popup");
      window.navigationMap.jumpTo({ center: [20, 40], zoom: 5, bearing: -35, pitch: 50 });
    });
    const beforeResetRequests = [...requests];
    await button("Reset map view").click(); await resetCamera();
    assert.equal(await page.evaluate(() => window.navigationStore.getState() === window.navigationBeforeReset), true);
    assert.equal(await page.evaluate(() => JSON.stringify(localStorage) === window.navigationStorage), true);
    assert.equal(await page.evaluate(() => window.navigationPopup === document.querySelector(".mapboxgl-popup")), true);
    assert.deepEqual(requests, beforeResetRequests, "Camera reset must make no capital API requests, including writes");
    await showView(page, "Capitals"); assert.equal(await page.getByRole("searchbox").inputValue(), "Berlin"); assert.equal(await continentValue(page), "Europe");
    await page.getByRole("searchbox").fill(""); await chooseContinent(page, ""); await showView(page, "Map");
    if (width > 700) {
      await shot(`map-controls-expanded-${width}`); await geometry();
      await button("Collapse sidebar").click(); await idle(); await shot(`map-controls-collapsed-${width}`); await geometry();
      await button("Expand sidebar").click(); await idle();
    } else {
      const beforeTabs = await camera(); await showView(page, "Capitals"); assert.equal(await button("Reset map view").isVisible(), false);
      await showView(page, "Map"); await idle(); assert.deepEqual(await camera(), beforeTabs); await shot(`map-controls-mobile-${width}`);
    }
    evidence.push({ width, ...await geometry() });
    await showView(page, "Capitals"); await page.locator("#add-capital").click(); await page.getByLabel("Capital name", { exact: true }).fill("Draft capital");
    // Programmatic activation also leaves an existing native CRUD dialog intact.
    await page.locator('.map-navigation [aria-label="Reset map view"]').evaluate(el => el.click());
    assert.equal(await page.getByRole("dialog", { name: "Add a New Capital City", exact: true }).isVisible(), true);
    assert.equal(await page.getByLabel("Capital name", { exact: true }).inputValue(), "Draft capital");
    await button("Select on map").click(); await page.locator(".coordinate-pick-banner").waitFor();
    assert.equal(await page.locator(".map-navigation").isVisible(), false);
    const pickingCamera = await camera();
    await page.locator('.map-navigation button').evaluateAll(buttons => buttons.forEach(button => button.click())); assert.deepEqual(await camera(), pickingCamera);
    assert.equal(await page.locator("canvas").evaluate(el => getComputedStyle(el).cursor), "crosshair");
    const canvas = await page.locator("canvas").boundingBox();
    await page.mouse.click(canvas.x + canvas.width * 0.65, canvas.y + canvas.height * 0.75);
    await page.getByRole("dialog", { name: "Add a New Capital City", exact: true }).waitFor();
    assert.equal(await page.getByLabel("Capital name", { exact: true }).inputValue(), "Draft capital");
    assert.notEqual(await page.getByLabel("Latitude", { exact: true }).inputValue(), "");
    assert.equal(await page.locator("canvas").evaluate(el => el.style.cursor), "");
    await button("Select on map").click(); await page.locator(".coordinate-pick-banner").waitFor(); await button("Cancel").click();
    await page.getByRole("dialog", { name: "Add a New Capital City", exact: true }).waitFor(); await page.keyboard.press("Escape");
    await showView(page, "Map");
    assert.equal(await button("Reset map view").isEnabled(), true); assert.equal(await page.locator(".map-navigation").isVisible(), true);
  }
  assert.equal(await page.evaluate(() => window.navigationCanvas === document.querySelector("canvas")
    && window.navigationMarkers.every((marker, index) => marker === document.querySelectorAll(".capital-marker")[index]
      && marker.offsetWidth === 32 && marker.offsetHeight === 32)), true);
  assert.equal(await page.evaluate(() => window.navigationCreations), 1);
  assert.equal(await page.evaluate(() => window.navigationMap.getStyle().name === window.navigationStyle
    && JSON.stringify(window.navigationMap.getProjection()) === JSON.stringify(window.navigationProjection)), true);
  assert.deepEqual(requests, initialRequests); assert.deepEqual(errors, []);
  return { evidence, requests, creations: 1, cameraOnlyReset: true, errors };
}
