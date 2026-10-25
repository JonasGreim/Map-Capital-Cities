/* global document, window, performance, innerWidth, URL */
import assert from "node:assert/strict";

// Fresh Chromium context, real Mapbox; every capital request is mocked.
export async function verifyReset(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(15_000);
  const defaults = [
    { id: 101, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 },
    { id: 102, name: "Prague", country: "Czechia", latitude: 50.0755, longitude: 14.4378 },
  ];
  const edited = [
    { ...defaults[0], id: 1, name: "Edited Berlin", country: "Edited country", latitude: 0, longitude: 0 },
    { ...defaults[1], id: 2, latitude: 20, longitude: 30 },
    { id: 3, name: "Manual capital", country: "Manual country", latitude: 10, longitude: 10 },
  ];
  let records = edited;
  let mode = "success";
  let readMode = "success";
  let release;
  let posts = 0;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/capital{,-reset,/*}", async route => {
    if (route.request().method() === "GET") {
      return route.fulfill(readMode === "error" ? { status: 503, json: {} } : { json: records });
    }
    assert.equal(new URL(route.request().url()).pathname, "/capital-reset");
    assert.deepEqual(route.request().postDataJSON(), { confirm: true });
    posts++;
    if (mode === "hold") await new Promise(resolve => { release = resolve; });
    if (mode === "error") return route.fulfill({ status: 500, json: { error: "private SQL details" } });
    if (mode === "lost") {
      records = defaults;
      return route.abort("failed");
    }
    records = defaults;
    return route.fulfill({ json: defaults });
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const focused = async locator => {
    await page.waitForFunction(el => document.activeElement === el, await locator.elementHandle());
  };
  const dialog = () => page.getByRole("dialog", { name: "Reset to default", exact: true });
  const evidence = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    records = edited;
    mode = "success";
    readMode = "success";
    await page.setViewportSize({ width, height });
    await page.goto(baseURL);
    await page.locator(".capital-marker").nth(2).waitFor();
    assert.equal(await button("Refresh list").count(), 0);
    const positions = await page.locator(".list-actions button").evaluateAll(elements => elements.map(el => {
      const r = el.getBoundingClientRect(); return { x: r.x, y: r.y, right: r.right };
    }));
    assert.equal(positions[0].y, positions[1].y, `actions must remain adjacent at ${width}px`);
    assert.ok(positions[1].x >= positions[0].right);
    await page.evaluate(async () => {
      const path = performance.getEntriesByType("resource").find(entry => entry.name.includes("/mapbox-gl.js?")).name;
      const { default: mapbox } = await import(path);
      const flyTo = mapbox.Map.prototype.flyTo;
      mapbox.Map.prototype.flyTo = function (...args) { window.resetMap = this; return flyTo.apply(this, args); };
      window.resetCanvas = document.querySelector(".mapboxgl-canvas");
    });
    await button("Show Edited Berlin, Edited country on map").click();
    await button("Red marker").click();
    await button("Show Prague, Czechia on map").click();
    await button("Purple marker").click();
    await page.waitForFunction(() => window.resetMap && !window.resetMap.isMoving());
    const camera = await page.evaluate(() => ({ center: window.resetMap.getCenter().toArray(), zoom: window.resetMap.getZoom() }));
    const before = posts;
    await button("Reset to default").focus();
    await page.keyboard.press("Enter");
    await dialog().waitFor();
    await focused(button("Cancel"));
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/reset-dialog-${width}.png`, fullPage: true });
    await page.keyboard.press("Tab");
    await focused(button("Reset capitals"));
    await page.keyboard.press("Shift+Tab");
    await focused(button("Cancel"));
    await page.keyboard.press("Escape");
    await focused(button("Reset to default"));
    assert.equal(posts, before);
    assert.equal(await page.locator(".capital-marker").count(), 3);
    await button("Reset to default").click();
    await button("Cancel").click();
    assert.equal(posts, before);

    // Hold the write: repeated activation and Escape must not launch/dismiss it.
    mode = "hold";
    await button("Reset to default").click();
    await button("Reset capitals").evaluate(el => { el.click(); el.click(); });
    await page.getByText("Resetting capitals…", { exact: true }).waitFor();
    assert.equal(await button("Cancel").isDisabled(), true);
    assert.equal(await button("Add capital").isDisabled(), true);
    await page.keyboard.press("Escape");
    assert.equal(await dialog().isVisible(), true);
    assert.equal(posts, before + 1);
    assert.equal(await page.locator(".capital-marker").count(), 3);
    release();
    await dialog().waitFor({ state: "hidden" });
    await focused(button("Reset to default"));
    await page.getByText("Default capitals restored. Marker colors reset to Teal.", { exact: true }).waitFor();
    assert.equal(await page.locator(".capital-marker").count(), 2);
    assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
    assert.equal(await page.locator("li[data-selected]").count(), 0);
    assert.equal(await button("Actions for Manual capital").count(), 0);
    assert.deepEqual(await page.evaluate(async () => {
      const { useCapitalStore } = await import("/src/capital-store.ts");
      return useCapitalStore.getState().capitals;
    }), defaults);
    assert.equal(await page.locator(".capital-marker").evaluateAll(elements => elements.every(el =>
      el.style.backgroundColor === "rgb(33, 98, 120)" && el.offsetWidth === 32 && el.offsetHeight === 32)), true);
    assert.deepEqual(await page.evaluate(() => ({ center: window.resetMap.getCenter().toArray(), zoom: window.resetMap.getZoom() })), camera);
    assert.equal(await page.evaluate(() => window.resetCanvas === document.querySelector(".mapboxgl-canvas")), true);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    // Reset preserves the camera, so restored coordinates may be offscreen.
    await button("Show Berlin, Germany on map").click();
    assert.equal(await button("Teal marker").getAttribute("aria-pressed"), "true");
    await page.waitForFunction(() => !window.resetMap.isMoving());
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/reset-${width}.png`, fullPage: true });
    evidence.push({ width, cancel: true, keyboard: true, duplicateProtection: true, teal: true, canvasAndCameraPreserved: true, overflow: false });
  }
  // A known failure preserves the current color and data, with safe focused feedback.
  await button("Red marker").click();
  mode = "error";
  const before = posts;
  await button("Reset to default").click();
  await button("Reset capitals").click();
  const alert = dialog().getByRole("alert");
  await alert.waitFor();
  await focused(alert);
  assert.doesNotMatch(await alert.textContent(), /private SQL/);
  assert.equal(await page.locator(".mutation-notice").textContent(), "");
  assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");
  assert.equal(posts, before + 1);
  await button("Reload current data").click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(posts, before + 1);
  assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");

  // Lost response after commit: show uncertainty, read only, never repeat POST.
  mode = "lost";
  await button("Reset to default").click();
  await button("Reset capitals").click();
  await dialog().getByRole("alert").waitFor();
  assert.match(await dialog().getByRole("alert").textContent(), /may have completed/);
  readMode = "error";
  await button("Reload current data").click();
  await page.getByRole("alert").filter({ hasText: /Unable to load capitals/ }).first().waitFor();
  await button("Cancel").click();
  await focused(button("Try again"));
  readMode = "success";
  await button("Try again").click();
  await button("Actions for Berlin").waitFor();
  assert.equal(posts, before + 2);
  assert.deepEqual(errors, []);
  return { viewports: evidence, safeFailure: true, lostResponseReadRecovery: true, pageErrors: errors };
}
