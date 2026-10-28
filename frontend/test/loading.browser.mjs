/* global window, document, getComputedStyle, innerWidth, innerHeight, setTimeout, clearTimeout, AbortSignal, AbortController, DOMException */
import assert from "node:assert/strict";
import { showView } from "./view-helpers.mjs";

// Real React/CSS and Mapbox; controlled API responses and time, no backend writes.
export async function verifyLoading(page, baseURL, screenshotDirectory) {
  const capitals = [{ id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 }];
  const errors = [], held = [];
  let mode = "hold", reads = 0;
  page.on("pageerror", error => errors.push(error.message));
  await page.clock.install();
  await page.addInitScript(() => {
    window.loadingTimers = new Set();
    window.loadingSetTimeout = (callback, ms) => {
      const id = setTimeout(() => { window.loadingTimers.delete(id); callback(); }, ms);
      window.loadingTimers.add(id);
      return id;
    };
    window.loadingClearTimeout = id => { window.loadingTimers.delete(id); clearTimeout(id); };
    // Native AbortSignal.timeout is outside Playwright's clock. Model its deadline
    // here; the API unit test separately asserts the actual requested budget.
    const timeout = AbortSignal.timeout.bind(AbortSignal);
    AbortSignal.timeout = ms => {
      if (ms !== 120_000) return timeout(ms);
      const controller = new AbortController();
      setTimeout(() => controller.abort(new DOMException("Timed out", "TimeoutError")), ms);
      return controller.signal;
    };
  });
  await page.route("**/src/CapitalLoadingStatus.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    assert.ok(source.includes("setTimeout("));
    await route.fulfill({ response, body: source.replaceAll("setTimeout(", "window.loadingSetTimeout(").replaceAll("clearTimeout(", "window.loadingClearTimeout(") });
  });
  await page.route("**/src/main.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    const root = 'createRoot(document.getElementById("root"))';
    assert.ok(source.includes(root));
    await route.fulfill({ response, body: source.replace('import { App }', 'import { App as ActualApp }')
      .replace(root, `(window.loadingRoot = ${root})`)
      + '\nimport React from "/node_modules/.vite/deps/react.js";\nfunction App() { return React.createElement(React.StrictMode, null, React.createElement(ActualApp)); }' });
  });
  await page.route("**/capital", route => {
    assert.equal(route.request().method(), "GET");
    reads++;
    if (mode === "hold") { held.push(route); return; }
    if (mode === "network") return route.abort("failed");
    if (mode === "http") return route.fulfill({ status: 503, json: {} });
    if (mode === "invalid") return route.fulfill({ json: {} });
    return route.fulfill({ json: capitals });
  });
  const status = page.locator(".capital-loading-status");
  const slow = () => status.getByText(/This demo uses free hosting/);
  const spinner = page.locator(".capital-loading-spinner");
  const timers = () => page.evaluate(() => window.loadingTimers.size);
  const layout = () => page.locator(".app-header, .layout, .map-panel, .list-content, .mobile-navigation")
    .evaluateAll(elements => elements.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
  const settled = async () => {
    await spinner.waitFor({ state: "detached" });
    assert.equal(await status.textContent(), "");
    assert.equal(await timers(), 0);
  };
  const evidence = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    mode = "hold";
    const before = reads;
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await spinner.waitFor();
    await page.waitForFunction(() => window.loadingTimers.size === 1);
    assert.equal(reads, before + 1, "StrictMode shares the pending GET");
    assert.equal(await slow().count(), 0);
    assert.equal(await page.getByText("No capitals available yet.", { exact: true }).count(), 0);
    await page.clock.fastForward(4_000);
    assert.equal(await slow().count(), 0);
    const geometry = await layout();
    await page.clock.fastForward(1_100);
    await slow().waitFor();
    assert.deepEqual(await layout(), geometry, "explanation must not shift the layout");
    assert.equal(await status.getAttribute("role"), "status");
    assert.equal(await status.getAttribute("aria-live"), "polite");
    assert.equal(await status.evaluate(el => !!el.closest('[hidden], [aria-busy="true"]')), false);
    assert.equal(await status.evaluate(el => {
      const r = el.getBoundingClientRect();
      const nav = document.querySelector(".mobile-navigation").getBoundingClientRect();
      return r.left >= 0 && r.right <= innerWidth && r.top >= 0
        && r.bottom <= innerHeight - nav.height && document.documentElement.scrollWidth <= innerWidth
        && getComputedStyle(el).pointerEvents === "none";
    }), true);
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await spinner.evaluate(el => getComputedStyle(el).animationName), "none");
    await page.emulateMedia({ reducedMotion: "no-preference" });
    assert.equal(await spinner.evaluate(el => getComputedStyle(el).animationName), "capital-loading-spin");
    await showView(page, "Capitals");
    await page.getByRole("searchbox").focus();
    await page.keyboard.type("Berlin");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Clear search");
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/loading-${width}.png` });
    await held.shift().fulfill({ json: capitals });
    await settled();
    await page.getByRole("button", { name: "Show Berlin, Germany on map" }).waitFor();
    await showView(page, "Map");
    await page.locator(".capital-marker").waitFor();
    assert.equal(reads, before + 1);
    evidence.push({ width, delayedSuccess: true, markerVisible: true, noLayoutShift: true, keyboardAndReducedMotion: true });
  }

  mode = "success";
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await showView(page, "Capitals");
  await page.getByRole("button", { name: "Show Berlin, Germany on map" }).waitFor();
  await settled();
  await page.clock.fastForward(6_000);
  assert.equal(await slow().count(), 0, "fast success cancels the explanation");

  for (const failure of ["http", "network", "invalid"]) {
    mode = failure;
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    await showView(page, "Capitals");
    await page.getByRole("alert").waitFor();
    await settled();
    const before = reads;
    await page.clock.fastForward(6_000);
    assert.equal(reads, before, "no automatic retries");
    mode = "success";
    await page.getByRole("button", { name: "Try again" }).click();
    await page.getByRole("button", { name: "Show Berlin, Germany on map" }).waitFor();
    await settled();
    assert.equal(reads, before + 1);
  }

  // Errors must also be actionable without opening the sidebar or changing tabs.
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    mode = "http";
    const before = reads;
    await page.goto(baseURL, { waitUntil: "domcontentloaded" });
    if (width > 700) await page.getByRole("button", { name: "Collapse sidebar" }).click();
    const fallback = page.locator(".capital-load-error");
    await fallback.getByRole("alert").waitFor();
    assert.equal(await fallback.getByRole("alert").textContent(), "Unable to load capitals (HTTP 503). Please try again.");
    assert.equal(await page.getByRole("alert").count(), 1);
    assert.equal(await page.locator("#world-map").isVisible(), true);
    await page.clock.fastForward(6_000);
    assert.equal(reads, before + 1, "no automatic retry or tab change");
    assert.equal(await fallback.evaluate(el => {
      const r = el.getBoundingClientRect(), nav = document.querySelector(".mobile-navigation").getBoundingClientRect();
      const controls = document.querySelector(".map-navigation").getBoundingClientRect();
      return r.top >= controls.bottom && r.bottom <= innerHeight - nav.height;
    }), true, "error card must leave map controls and mobile navigation clear");
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/load-error-${width}.png` });

    await showView(page, "Capitals");
    if (width > 700) await page.getByRole("button", { name: "Expand sidebar" }).click();
    assert.equal(await fallback.count(), 0);
    assert.equal(await page.getByRole("alert").count(), 1);
    assert.equal(await page.getByRole("button", { name: "Try again" }).count(), 1);
    await showView(page, "Map");
    if (width > 700) await page.getByRole("button", { name: "Collapse sidebar" }).click();

    mode = "hold";
    const retry = fallback.getByRole("button", { name: "Try again" });
    await retry.focus();
    await page.keyboard.press("Shift+Tab");
    await page.keyboard.press("Tab");
    assert.equal(await retry.evaluate(el => document.activeElement === el), true);
    if (width === 1440) await page.keyboard.press("Enter");
    else await retry.click(); // Also verifies pointer-events on the mobile button.
    await spinner.waitFor();
    assert.equal(await fallback.count(), 0);
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(await page.locator("#world-map").isVisible(), true);
    await held.shift().fulfill({ json: capitals });
    await settled();
    await page.locator(".capital-marker").waitFor();
    assert.equal(await fallback.count(), 0);
    assert.equal(await page.getByRole("button", { name: "Try again" }).count(), 0);
    assert.equal(reads, before + 2);
    await showView(page, "Capitals");
    if (width > 700) await page.getByRole("button", { name: "Expand sidebar" }).click();
    await page.getByRole("button", { name: "Show Berlin, Germany on map" }).waitFor();
  }

  mode = "hold";
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await spinner.waitFor();
  await page.clock.fastForward(120_001);
  await showView(page, "Capitals");
  await page.getByRole("alert").filter({ hasText: "took too long" }).waitFor();
  await settled();
  await held.shift().fulfill({ json: capitals });
  const beforeRetry = reads;
  await page.getByRole("button", { name: "Try again" }).click();
  await spinner.waitFor();
  assert.equal(await slow().count(), 0, "retry starts a fresh explanation timer");
  assert.equal(await timers(), 1);
  await page.clock.fastForward(5_100);
  await slow().waitFor();
  await held.shift().fulfill({ json: capitals });
  await settled();
  assert.equal(reads, beforeRetry + 1);

  // Even an empty result counts as loaded; later reads need no hosting explanation.
  await page.evaluate(async () => {
    const { useCapitalStore } = await import("/src/capital-store.ts");
    window.loadingStore = useCapitalStore;
    useCapitalStore.setState({ capitals: [] });
    void useCapitalStore.getState().fetchCapitals();
  });
  await spinner.waitFor();
  assert.equal(await timers(), 0);
  await page.clock.fastForward(6_000);
  assert.equal(await slow().count(), 0);
  await held.shift().fulfill({ json: [] });
  await settled();

  // Start a fresh initial cycle to inspect unmount cleanup with a pending timer.
  await page.evaluate(() => { window.loadingStore.setState({ hasLoaded: false }); void window.loadingStore.getState().fetchCapitals(); });
  await spinner.waitFor();
  assert.equal(await timers(), 1);
  await page.evaluate(() => window.loadingRoot.unmount());
  assert.equal(await timers(), 0);
  await held.shift().fulfill({ json: capitals });
  await page.clock.fastForward(6_000);
  assert.deepEqual(errors, []);
  return { viewports: evidence, fastSuccess: true, timeoutAndRetry: true, failureRecovery: true,
    strictModeDeduplication: true, timerCleanup: true, initialOnly: true, pageErrors: errors };
}
