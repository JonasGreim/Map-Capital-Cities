/* global document, window, innerWidth, innerHeight, KeyboardEvent, Event, structuredClone */
import assert from "node:assert/strict";

// Focused Issue #26 coverage. Every capital request is intercepted, including
// reset; only the real Mapbox resources use the network.
export async function verifySidebarPolish(page, baseURL, screenshotDirectory) {
  const defaults = Array.from({ length: 31 }, (_, i) => ({ id: i + 1,
    name: i === 0 ? "Berlin" : i === 15 ? "Middle capital" : i === 30 ? "A very long capital name that wraps across several lines" : `Capital ${i}`,
    country: i === 30 ? "A very long country name that wraps across several lines" : `Country ${i}`,
    latitude: 50, longitude: 14, continents: [i === 1 ? "Asia" : "Europe"],
  }));
  let records = structuredClone(defaults);
  let failWrite = false;
  const writes = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !message.text().includes("409 (Conflict)")) errors.push(message.text());
  });
  await page.route("**/capital{,-reset,/*}", route => {
    const request = route.request();
    const method = request.method();
    if (method === "GET") return route.fulfill({ json: records });
    writes.push(method);
    if (failWrite) return route.fulfill({ status: 409, json: {} });
    if (request.url().endsWith("/capital-reset")) {
      records = structuredClone(defaults);
      return route.fulfill({ json: records });
    }
    const id = Number(request.url().split("/").pop());
    if (method === "DELETE") {
      records = records.filter(capital => capital.id !== id);
      return route.fulfill({ status: 204 });
    }
    const saved = { ...request.postDataJSON(), id: method === "POST" ? 100 : id, continents: ["Europe"] };
    records = records.filter(capital => capital.id !== saved.id).concat(saved);
    return route.fulfill({ status: method === "POST" ? 201 : 200, json: saved });
  });
  await page.route("**/src/Map.tsx", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const anchor = "const capitalMarkers =";
    assert.ok(source.includes(anchor));
    await route.fulfill({ response, body: source.replace(anchor, `window.polishMap = map;\n${anchor}`) });
  });
  await page.route("**/src/main.tsx", async route => {
    const response = await route.fetch();
    const source = await response.text();
    const root = 'createRoot(document.getElementById("root"))';
    assert.ok(source.includes(root));
    await route.fulfill({ response, body: source.replace(root, `(window.polishRoot = ${root})`) });
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const search = page.getByRole("searchbox");
  const scroller = page.locator(".list-content");
  const menu = page.locator(".capital-actions-menu");
  const notice = page.locator(".mutation-notice");
  const focus = async locator => assert.equal(await locator.evaluate(el => el === document.activeElement), true);
  const camera = () => page.evaluate(() => ({ center: window.polishMap.getCenter().toArray(), zoom: window.polishMap.getZoom() }));
  const listGeometry = () => page.evaluate(() => ({ scroll: document.querySelector(".list-content").scrollTop, page: window.scrollY,
    rows: [...document.querySelectorAll(".capital-list li")].map(el => { const r = el.getBoundingClientRect(); return [r.top, r.height]; }) }));
  const activateMarker = async id => {
    await page.locator(`.capital-marker`).nth(id - 1).evaluate(el => el.click());
    await focus(button("Teal marker"));
  };
  const centered = async () => assert.equal(await scroller.evaluate(el => {
    const row = el.querySelector("li[data-selected] .capital-label").getBoundingClientRect();
    const bounds = el.getBoundingClientRect();
    const ideal = el.scrollTop + row.top - bounds.top - el.clientTop + row.height / 2 - el.clientHeight / 2;
    return Math.abs(el.scrollTop - Math.max(0, Math.min(ideal, el.scrollHeight - el.clientHeight))) <= 1;
  }), true);
  const evidence = [];
  await page.goto(baseURL);
  await button("Actions for Berlin").waitFor();
  await page.waitForFunction(() => window.polishMap?.isStyleLoaded());
  await page.emulateMedia({ reducedMotion: "reduce" });
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(() => {
      const map = document.querySelector(".map"), canvas = document.querySelector(".mapboxgl-canvas");
      return map.clientWidth === canvas.clientWidth && map.clientHeight === canvas.clientHeight && !window.polishMap.isMoving();
    });
    await scroller.evaluate(el => { el.scrollTop = 0; });
    await page.evaluate(() => window.scrollTo(0, 0));
    const lastVisibleId = await scroller.evaluate(el => {
      const bounds = el.getBoundingClientRect();
      return [...el.querySelectorAll(".actions-trigger")].filter(button => {
        const r = button.getBoundingClientRect(); return r.top >= bounds.top && r.bottom <= bounds.bottom;
      }).at(-1).id;
    });
    const long = button(`Actions for ${defaults.at(-1).name}`);
    for (const trigger of [button("Actions for Berlin"), page.locator(`#${lastVisibleId}`), long]) {
      await trigger.scrollIntoViewIfNeeded();
      await trigger.focus();
      const before = await listGeometry();
      await page.keyboard.press("Enter");
      await focus(button("Edit"));
      assert.deepEqual(await listGeometry(), before, "menu must not move rows, list or page");
      assert.equal(await menu.evaluate(el => {
        const r = el.getBoundingClientRect();
        return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
          && [...el.querySelectorAll("button")].every(button => {
            const b = button.getBoundingClientRect(); return button.contains(document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2));
          });
      }), true);
      await page.keyboard.press("Tab");
      await focus(button("Delete"));
      if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/menu-${width}-${await trigger.getAttribute("id")}.png` });
      await page.keyboard.press("Escape");
      await focus(trigger);
    }
    await button("Actions for Berlin").scrollIntoViewIfNeeded();
    await button("Actions for Berlin").focus();
    await page.keyboard.press("Space");
    await page.keyboard.press("Shift+Tab");
    await focus(button("Actions for Berlin"));
    assert.equal(await menu.count(), 0);
    await page.keyboard.press("Space");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await focus(button("Show Capital 1, Country 1 on map"));
    assert.equal(await menu.count(), 0);
    await button("Actions for Berlin").click();
    await page.getByRole("heading", { name: "Countries & capitals" }).click();
    assert.equal(await menu.count(), 0);
    await button("Actions for Berlin").click();
    await scroller.evaluate(el => { el.scrollTop += 30; });
    await menu.waitFor({ state: "hidden" });
    await button("Actions for Berlin").click();
    await page.setViewportSize({ width: width + 1, height });
    await menu.waitFor({ state: "hidden" });
    await page.setViewportSize({ width, height });
    await button("Actions for Berlin").click();
    await page.getByLabel("Continent", { exact: true }).selectOption("Asia");
    assert.equal(await menu.count(), 0);
    await page.getByLabel("Continent", { exact: true }).selectOption("");
    await button("Actions for Berlin").click();
    await button("Collapse sidebar").click();
    assert.equal(await menu.count(), 0);
    await button("Expand sidebar").click();
    assert.equal(await menu.count(), 0);
    // Establish a view with enough room for even the longest popup. Existing
    // Mapbox popup fitting may navigate at world zoom; sidebar reveal must not.
    await button(`Show ${defaults.at(-1).name}, ${defaults.at(-1).country} on map`).click();
    await page.waitForFunction(() => !window.polishMap.isMoving());
    await page.keyboard.press("Escape");
    await page.evaluate(() => window.scrollTo(0, 0));
    const view = await camera();
    for (const id of [16, 16, 1, 31]) {
      await scroller.evaluate(el => { el.scrollTop = 0; });
      const pageScroll = await page.evaluate(() => window.scrollY);
      await activateMarker(id);
      await centered();
      assert.equal(await page.evaluate(() => window.scrollY), pageScroll);
      assert.deepEqual(await camera(), view);
    }
    // Unrelated store updates must not recenter an intentionally scrolled list.
    await scroller.evaluate(el => { el.scrollTop = 12; });
    await page.evaluate(async () => {
      const { useCapitalStore } = await import("/src/capital-store.ts");
      useCapitalStore.setState({ capitals: [...useCapitalStore.getState().capitals] });
    });
    assert.equal(await scroller.evaluate(el => el.scrollTop), 12);
    await search.fill("Berlin");
    await activateMarker(16);
    assert.equal(await search.inputValue(), "Berlin");
    assert.equal(await page.locator("li[data-selected]").count(), 0);
    await button("Collapse sidebar").click();
    await button("Teal marker").focus();
    await activateMarker(16);
    assert.equal(await page.locator("#capital-sidebar").isVisible(), false);
    await button("Expand sidebar").click();
    await page.getByLabel("Continent", { exact: true }).selectOption("Europe");
    const filteredView = await camera();
    const markerState = await page.locator(".capital-marker").evaluateAll(elements => elements.map(el => [el.hidden, el.getAttribute("aria-pressed"), el.style.backgroundColor]));
    assert.equal(await button("Clear search").count(), 1);
    await button("Clear search").click();
    await focus(search);
    assert.equal(await search.inputValue(), "");
    assert.equal(await button("Clear search").count(), 0);
    assert.equal(await page.locator(".capital-list li").count(), 30);
    await search.fill("  ");
    await page.keyboard.press("Tab");
    await focus(button("Clear search"));
    await page.keyboard.press("Enter");
    await focus(search);
    assert.equal(await search.inputValue(), "");
    assert.equal(await page.getByLabel("Continent", { exact: true }).inputValue(), "Europe");
    assert.deepEqual(await camera(), filteredView);
    assert.deepEqual(await page.locator(".capital-marker").evaluateAll(elements => elements.map(el => [el.hidden, el.getAttribute("aria-pressed"), el.style.backgroundColor])), markerState);
    await page.getByLabel("Continent", { exact: true }).selectOption("");
    // Menus/dialogs never request list-to-map navigation.
    const beforeActions = await camera();
    await button("Actions for Berlin").click();
    await button("Edit").click();
    await page.keyboard.press("Escape");
    await focus(button("Actions for Berlin"));
    await button("Actions for Berlin").click();
    await button("Delete").click();
    await button("Cancel").click();
    await focus(button("Actions for Berlin"));
    assert.deepEqual(await camera(), beforeActions);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    evidence.push({ width, height, menuGeometry: true, keyboardAndFocus: true, centeredAndClamped: true, repeatedMarker: true,
      filtersAndCollapse: true, clearSearch: true, cameraPreserved: true, overflow: false });
  }
  // Install a deterministic browser clock only after real-map interaction tests.
  await page.clock.install();
  await page.evaluate(() => {
    const schedule = window.setTimeout.bind(window), cancel = window.clearTimeout.bind(window);
    window.noticeTimers = new Set();
    window.menuListeners = new Set();
    for (const [target, types] of [[document, ["pointerdown", "focusin", "keydown", "scroll"]], [window, ["resize"]]]) {
      const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
      target.addEventListener = (type, listener, options) => {
        if (types.includes(type)) window.menuListeners.add(listener);
        add(type, listener, options);
      };
      target.removeEventListener = (type, listener, options) => {
        if (types.includes(type)) window.menuListeners.delete(listener);
        remove(type, listener, options);
      };
    }
    window.setTimeout = (fn, delay, ...args) => {
      const id = schedule(() => { window.noticeTimers.delete(id); fn(...args); }, delay);
      if (delay === 4000) window.noticeTimers.add(id);
      return id;
    };
    window.clearTimeout = id => { window.noticeTimers.delete(id); cancel(id); };
  });
  const fillForm = async name => {
    for (const [label, value] of [["Capital name", name], ["Country name", "Test country"], ["Latitude", "10"], ["Longitude", "20"]]) {
      await page.getByLabel(label, { exact: true }).fill(value);
    }
  };
  await button("Add capital").click();
  await fillForm("New capital");
  const beforeCreate = await scroller.boundingBox();
  await button("Create capital").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  assert.equal(await notice.textContent(), "Capital created.");
  assert.deepEqual(await scroller.boundingBox(), beforeCreate);
  await focus(button("Add capital"));
  await page.clock.fastForward(2500);
  await button("Actions for Berlin").click();
  await button("Edit").click();
  assert.equal(await notice.textContent(), "");
  await button("Save changes").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  assert.equal(await notice.textContent(), "Capital updated.");
  await page.clock.fastForward(1600); // Past the original create timer.
  assert.equal(await notice.textContent(), "Capital updated.");
  await page.clock.fastForward(1900);
  assert.equal(await notice.textContent(), "Capital updated.");
  await page.clock.fastForward(600);
  assert.equal(await notice.textContent(), "");
  await button("Actions for New capital").click();
  await button("Delete").click();
  await button("Delete capital").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  assert.equal(await notice.textContent(), "Capital deleted.");
  await page.clock.fastForward(4100);
  assert.equal(await notice.textContent(), "");
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(() => window.scrollTo(0, 0));
    await button("Reset to default").click();
    const beforeReset = await scroller.boundingBox();
    await button("Reset capitals").click();
    await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
    await page.evaluate(() => window.scrollTo(0, 0));
    assert.equal(await notice.textContent(), "Default capitals restored. Marker colors reset to Teal.");
    assert.deepEqual(await scroller.boundingBox(), beforeReset);
    await focus(button("Reset to default"));
    assert.equal(await notice.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
        && [...document.querySelectorAll(".list-search, .list-continent, .list-actions, .map-panel")].every(control => {
          const b = control.getBoundingClientRect(); return r.bottom <= b.top || r.top >= b.bottom || r.right <= b.left || r.left >= b.right;
        });
    }), true);
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/toast-${width}.png`, fullPage: true });
    await page.clock.fastForward(4100);
    assert.equal(await notice.textContent(), "");
  }
  failWrite = true;
  await button("Actions for Berlin").click();
  await button("Edit").click();
  await button("Save changes").click();
  const alert = page.getByRole("alert");
  await alert.waitFor();
  await page.clock.fastForward(5000);
  assert.equal(await alert.isVisible(), true);
  assert.equal(await notice.textContent(), "");
  await button("Cancel").click();
  failWrite = false;
  await button("Reset to default").click();
  await button("Reset capitals").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  assert.equal(await page.evaluate(() => window.noticeTimers.size), 1);
  await button("Actions for Berlin").click();
  assert.equal(await page.evaluate(() => window.menuListeners.size), 5);
  await page.evaluate(() => window.polishRoot.unmount());
  assert.equal(await page.evaluate(() => window.menuListeners.size), 0);
  assert.equal(await menu.count(), 0);
  assert.equal(await page.evaluate(() => window.noticeTimers.size), 0);
  await page.clock.fastForward(5000);
  await page.evaluate(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); window.dispatchEvent(new Event("resize")); });
  assert.deepEqual(errors, []);
  return { viewports: evidence, mockedWrites: writes, toastTimingRestartAndCleanup: true, persistentErrors: true, pageErrors: errors };
}
