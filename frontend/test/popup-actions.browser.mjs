/* global document, window, innerWidth, innerHeight, structuredClone, Event, KeyboardEvent, URL, getComputedStyle */
import assert from "node:assert/strict";

// Real Mapbox, native dialogs and pointer/keyboard interaction. All capital
// requests (including reset) are intercepted; no backend or DB is started.
export async function verifyPopupActions(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(15_000);
  const defaults = [
    { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, flagCode: "DE", continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] },
    { id: 2, name: "Prague", country: "Czechia", latitude: 50.07, longitude: 14.43, flagCode: "CZ", continents: ["Europe"], population: 10800000, currencies: [{ code: "CZK", name: "Czech koruna" }] },
    { id: 3, name: "A very long capital name that wraps across several lines", country: "A very long country name that wraps across several lines", latitude: 0, longitude: 0, flagCode: null, continents: ["Asia", "Europe"], population: 0,
      currencies: [{ code: "EUR", name: "An exceptionally long currency name that must wrap safely inside the small popup" }, { code: "USD", name: "US dollar" }, { code: "JPY" }] },
  ];
  let records;
  let failure = null;
  let release;
  let entered;
  let hold = false;
  const writes = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !/Failed to load resource: (net::ERR_FAILED|the server responded with a status of (400|404|409|500))/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/capital{,-reset,/*}", async route => {
    const request = route.request(), method = request.method();
    if (method === "GET") return route.fulfill({ json: records });
    writes.push({ method, url: new URL(request.url()).pathname });
    if (hold) { entered(); await new Promise(resolve => { release = resolve; }); }
    if (failure === "network") return route.abort("failed");
    if (failure) return route.fulfill({ status: failure, json: {} });
    if (request.url().endsWith("/capital-reset")) {
      records = structuredClone(defaults);
      return route.fulfill({ json: records });
    }
    const id = Number(request.url().split("/").at(-1));
    if (method === "DELETE") {
      records = records.filter(capital => capital.id !== id);
      return route.fulfill({ status: 204 });
    }
    const input = request.postDataJSON();
    assert.deepEqual(Object.keys(input).sort(), ["country", "latitude", "longitude", "name"]);
    const metadata = input.country === "Japan" ? { flagCode: "JP", continents: ["Asia"], population: 123000000, currencies: [{ code: "JPY", name: "Japanese yen" }] }
      : defaults.find(capital => capital.country === input.country) ?? { flagCode: null, continents: null, population: null, currencies: null };
    const saved = { ...input, id, flagCode: metadata.flagCode, continents: metadata.continents, population: metadata.population, currencies: metadata.currencies };
    records = records.map(capital => capital.id === id ? saved : capital);
    return route.fulfill({ json: saved });
  });
  await page.route("**/src/Map.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    assert.ok(source.includes("const capitalMarkers ="));
    await route.fulfill({ response, body: source.replace("const capitalMarkers =", `
      window.popupMap = map;
      window.popupMaps = (window.popupMaps || 0) + 1;
      window.popupFlights = 0;
      const originalFly = map.flyTo.bind(map);
      map.flyTo = (...args) => { window.popupFlights++; return originalFly(...args); };
      const capitalMarkers =`) });
  });
  await page.route("**/src/main.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    const anchor = 'createRoot(document.getElementById("root"))';
    assert.ok(source.includes(anchor));
    await route.fulfill({ response, body: source.replace(anchor, `(window.popupRoot = ${anchor})`) });
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const marker = id => {
    const capital = records.find(capital => capital.id === id);
    return page.getByRole("button", { name: `${capital.name}, ${capital.country}: change marker color`, exact: true, includeHidden: true });
  };
  const trigger = () => page.locator(".popup-actions-trigger");
  const menu = page.locator(".capital-actions-menu");
  const dialog = page.locator("dialog.capital-dialog");
  const focus = async locator => { await page.waitForFunction(el => el === document.activeElement, await locator.elementHandle()); };
  const settled = () => page.waitForFunction(() => !window.popupMap.isMoving()
    && window.popupMap.getCanvas().clientWidth === window.popupMap.getContainer().clientWidth
    && window.popupMap.getCanvas().clientHeight === window.popupMap.getContainer().clientHeight);
  const camera = () => page.evaluate(() => ({ center: window.popupMap.getCenter().toArray(), zoom: window.popupMap.getZoom(), flights: window.popupFlights }));
  const state = () => page.evaluate(async () => {
    const { useCapitalStore } = await import("/src/capital-store.ts");
    const { capitals, selectedCapitalId, continent } = useCapitalStore.getState();
    return { capitals, selectedCapitalId, continent };
  });
  const openMarker = async (id = 1) => {
    // Position it as an edge marker. Its actual pointer activation exercises the
    // existing popup-fit logic; actions below must never request another flight.
    await page.evaluate(id => {
      const positions = [[13.405, 52.52], [14.43, 50.07], [0, 0]];
      window.popupMap.jumpTo({ center: positions[id - 1], zoom: 3 });
      window.popupMap.panBy([window.popupMap.getContainer().clientWidth / 2 - 40, 0], { duration: 0 });
    }, id);
    await marker(id).scrollIntoViewIfNeeded();
    await marker(id).click();
    await trigger().waitFor();
    await settled();
  };
  const action = async name => { await trigger().click(); await button(name).click(); await dialog.waitFor(); };
  const closed = async () => { await dialog.waitFor({ state: "hidden" }); };
  const facts = () => page.locator(".popup-facts dd").allTextContents();
  const popupBounds = () => page.evaluate(() => {
    const popup = document.querySelector(".mapboxgl-popup").getBoundingClientRect();
    const map = window.popupMap.getContainer().getBoundingClientRect();
    const content = document.querySelector(".capital-popup");
    return popup.left >= map.left - 1 && popup.right <= map.right + 1
      && popup.top >= map.top - 1 && popup.bottom <= map.bottom + 1
      && content.scrollWidth <= content.clientWidth;
  });
  const popupLayout = () => page.evaluate(() => {
    const title = document.querySelector(".capital-popup h2").getBoundingClientRect();
    const country = document.querySelector(".popup-country").getBoundingClientRect();
    const flag = document.querySelector(".capital-popup > .country-flag").getBoundingClientRect();
    const trigger = document.querySelector(".popup-actions-trigger").getBoundingClientRect();
    const close = document.querySelector(".mapboxgl-popup-close-button").getBoundingClientRect();
    const icons = [...document.querySelectorAll(".popup-icon")];
    const values = [...document.querySelectorAll(".popup-facts dd")].map(el => el.getBoundingClientRect());
    return {
      compactHeader: country.top - title.bottom >= 2 && country.top - title.bottom <= 4 && title.left === country.left,
      centeredFlag: Math.abs((flag.top + flag.bottom) / 2 - (title.top + country.bottom) / 2) <= 1,
      clearControls: Math.max(title.right, country.right) <= trigger.left && trigger.right <= close.left,
      uniformDecorativeIcons: icons.length === 4 && icons.every(icon => {
        const svg = icon.querySelector("svg"), bounds = svg.getBoundingClientRect();
        return icon.getAttribute("aria-hidden") === "true" && svg.getAttribute("focusable") === "false"
          && svg.getAttribute("aria-hidden") === "true" && bounds.width === 16 && bounds.height === 16
          && getComputedStyle(svg).strokeWidth === "1.8px" && getComputedStyle(icon).color === "rgb(8, 125, 150)";
      }),
      alignedFacts: values.every(value => value.right === values[0].right)
        && icons.every(icon => Math.abs(icon.getBoundingClientRect().left - icons[0].getBoundingClientRect().left) <= 1),
    };
  });
  const expectedLayout = { compactHeader: true, centeredFlag: true, clearControls: true, uniformDecorativeIcons: true, alignedFacts: true };
  const evidence = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    for (const collapsed of [false, true]) {
      records = structuredClone(defaults);
      failure = null;
      await page.setViewportSize({ width, height });
      await page.goto(baseURL);
      await marker(3).waitFor();
      await page.waitForFunction(() => window.popupMap?.isStyleLoaded());
      await page.emulateMedia({ reducedMotion: "reduce" });
      if (collapsed) await button("Collapse sidebar").click();
      await settled();
      await page.evaluate(() => {
        window.originalPopupMap = window.popupMap;
        window.originalPopupCanvas = window.popupMap.getCanvas();
        window.originalPopupMarker = document.querySelector(".capital-marker");
        window.actionListeners = new Set();
        for (const [target, types] of [[document, ["pointerdown", "focusin", "keydown", "scroll"]], [window, ["resize"]]]) {
          const add = target.addEventListener.bind(target), remove = target.removeEventListener.bind(target);
          target.addEventListener = (type, listener, options) => {
            if (types.includes(type)) window.actionListeners.add(listener);
            add(type, listener, options);
          };
          target.removeEventListener = (type, listener, options) => {
            if (types.includes(type)) window.actionListeners.delete(listener);
            remove(type, listener, options);
          };
        }
      });
      await openMarker();
      assert.deepEqual(await page.locator(".popup-facts dt").allTextContents(), ["Continent", "Country population", "Currency"]);
      assert.deepEqual(await facts(), ["Europe", "83,200,000", "Euro (EUR)"]);
      assert.equal(await page.locator(".popup-coordinates").textContent(), "52.5200, 13.4050");
      assert.match(await page.locator(".capital-popup .country-flag img").getAttribute("src"), /de.svg$/);
      assert.equal(await popupBounds(), true);
      assert.deepEqual(await popupLayout(), expectedLayout);
      if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/country-facts-${width}-${collapsed ? "collapsed" : "open"}.png` });
      await button("Purple marker").click();
      const before = await camera();
      const startWrites = writes.length;
      for (const key of ["Enter", "Space", "Enter"]) {
        await trigger().focus();
        await page.keyboard.press(key);
        await focus(button("Edit"));
        assert.equal(await menu.count(), 1);
        assert.equal(await page.evaluate(() => window.actionListeners.size), 5);
        await page.keyboard.press("Tab");
        await focus(button("Delete"));
        await page.keyboard.press("Escape");
        await focus(trigger());
        assert.equal(await menu.count(), 0);
        assert.equal(await page.locator(".mapboxgl-popup").count(), 1);
        assert.equal(await page.evaluate(() => window.actionListeners.size), 0);
      }
      await trigger().click();
      await button("Gold marker").click(); // outside click keeps popup open
      assert.equal(await menu.count(), 0);
      assert.equal(await button("Gold marker").getAttribute("aria-pressed"), "true");
      await trigger().click();
      await page.keyboard.press("Shift+Tab");
      await focus(trigger());
      assert.equal(await menu.count(), 0);
      await action("Edit");
      assert.equal(await dialog.count(), 1);
      await focus(page.getByLabel("Capital name", { exact: true }));
      for (const [label, value] of [["Capital name", "Berlin"], ["Country name", "Germany"], ["Latitude", "52.52"], ["Longitude", "13.405"]]) {
        assert.equal(await page.getByLabel(label, { exact: true }).inputValue(), value);
      }
      await page.keyboard.press("Escape");
      await closed();
      await focus(trigger());
      await action("Delete");
      assert.match(await dialog.textContent(), /Delete Berlin, Germany\?/);
      await button("Cancel").click();
      await closed();
      await focus(trigger());
      assert.equal(writes.length, startWrites);
      assert.deepEqual(await camera(), before);

      // Local validation + controlled HTTP/network errors preserve every input,
      // canonical record, selection, popup and camera without success feedback.
      await action("Edit");
      await page.getByLabel("Capital name", { exact: true }).fill("");
      await button("Save changes").click();
      await focus(page.getByLabel("Capital name", { exact: true }));
      assert.equal(writes.length, startWrites);
      await page.getByLabel("Capital name", { exact: true }).fill("Updated Berlin");
      for (const error of [400, 404, 409, 500, "network"]) {
        failure = error;
        const count = writes.length;
        await button("Save changes").click();
        await focus(dialog.getByRole("alert"));
        assert.equal(writes.length, count + 1);
        assert.equal(await page.getByLabel("Capital name", { exact: true }).inputValue(), "Updated Berlin");
        assert.equal((await state()).capitals.find(row => row.id === 1).name, "Berlin");
        assert.equal((await state()).selectedCapitalId, 1);
        assert.equal(await page.locator(".mutation-notice").textContent(), "");
      }
      failure = null;
      // One pending PUT, disabled dismissal/duplicates, then a confirmed edit.
      hold = true;
      const saving = new Promise(resolve => { entered = resolve; });
      const count = writes.length;
      await button("Save changes").click();
      await saving;
      await page.waitForFunction(() => document.querySelector("dialog").getAttribute("aria-busy") === "true");
      assert.equal(await button("Saving…").isDisabled(), true);
      assert.equal(await button("Cancel").isDisabled(), true);
      await page.keyboard.press("Escape");
      assert.equal(await dialog.count(), 1);
      // release is installed by the intercepted request before Saving… appears.
      hold = false;
      release();
      await closed();
      await focus(trigger());
      assert.equal(writes.length, count + 1);
      assert.equal(await page.locator(".capital-popup h2").textContent(), "Updated Berlin");
      assert.equal((await state()).selectedCapitalId, 1);
      assert.equal(await page.locator(".mutation-notice").isVisible(), true);
      assert.equal(await page.locator(".mutation-notice").textContent(), "Capital updated.");
      assert.deepEqual(await camera(), before);
      assert.equal(await marker(1).evaluate(el => el.style.backgroundColor), "rgb(148, 98, 0)");

      // Confirmed country changes update the very same popup and ID. Unknown
      // and omitted facts cannot retain any data from the previous country.
      await page.evaluate(() => { window.originalFactsPopup = document.querySelector(".capital-popup"); });
      for (const [country, expected, code] of [
        ["Japan", ["Asia", "123,000,000", "Japanese yen (JPY)"], "jp"],
        ["Unknown <img src=x onerror=alert(1)>", ["—", "—", "—"], null],
        ["Germany", ["Europe", "83,200,000", "Euro (EUR)"], "de"],
      ]) {
        await action("Edit");
        await page.getByLabel("Country name", { exact: true }).fill(country);
        await button("Save changes").click();
        await closed();
        assert.deepEqual(await facts(), expected);
        assert.equal(await page.locator(".popup-country").textContent(), country);
        assert.equal(await page.locator(".popup-country img").count(), 0);
        if (code) assert.match(await page.locator(".capital-popup .country-flag img").getAttribute("src"), new RegExp(`/${code}.svg$`));
        else assert.equal(await page.locator(".capital-popup .country-flag img").count(), 0);
        assert.equal(await page.evaluate(() => window.originalFactsPopup === document.querySelector(".capital-popup")
          && window.originalPopupMarker === document.querySelector(".capital-marker")), true);
        assert.equal((await state()).selectedCapitalId, 1);
        assert.equal(await button("Gold marker").getAttribute("aria-pressed"), "true");
        assert.deepEqual(await camera(), before);
      }

      // Coordinates use the existing one-flight reconciliation by ID.
      await action("Edit");
      await page.getByLabel("Latitude", { exact: true }).fill("48");
      await page.getByLabel("Longitude", { exact: true }).fill("12");
      await button("Save changes").click();
      await closed();
      await settled();
      assert.equal((await camera()).flights, before.flights + 1);
      assert.equal(await page.locator(".popup-coordinates").textContent(), "48.0000, 12.0000");
      assert.equal(await page.evaluate(() => window.originalPopupMarker === document.querySelector(".capital-marker")), true);

      // The active filter can exclude a confirmed country edit. Search stays
      // untouched and the hidden marker retains its instance and chosen color.
      if (collapsed) await button("Expand sidebar").click();
      await page.getByLabel("Continent", { exact: true }).selectOption("Europe");
      await page.getByRole("searchbox").fill("Updated Berlin");
      if (collapsed) await button("Collapse sidebar").click();
      await settled();
      if (await trigger().count() === 0) await openMarker();
      const beforeCountry = await camera();
      await action("Edit");
      await page.getByLabel("Country name", { exact: true }).fill("Japan");
      await page.getByLabel("Capital name", { exact: true }).fill("Tokyo copy");
      await button("Save changes").click();
      await closed();
      await focus(collapsed ? page.locator(".mapboxgl-canvas") : button("Add capital"));
      assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
      assert.equal(await marker(1).isVisible(), false);
      assert.equal((await state()).selectedCapitalId, null);
      assert.equal((await state()).capitals.length, 3);
      assert.deepEqual((await state()).capitals.find(row => row.id === 1).continents, ["Asia"]);
      assert.deepEqual(await camera(), beforeCountry);
      if (collapsed) await button("Expand sidebar").click();
      assert.equal(await page.getByRole("searchbox").inputValue(), "Updated Berlin");
      await page.getByLabel("Continent", { exact: true }).selectOption("");
      assert.equal(await page.locator(".capital-list li").count(), 0, "text search must remain unchanged after rename");
      await button("Clear search").click();
      assert.equal(await page.locator(".capital-name").filter({ hasText: "Tokyo copy" }).count(), 1);
      if (collapsed) await button("Collapse sidebar").click();
      await openMarker();
      assert.equal(await page.locator(".capital-popup h2").textContent(), "Tokyo copy");
      assert.equal(await page.locator(".popup-country").textContent(), "Japan");
      assert.match(await page.locator(".capital-popup .country-flag img").getAttribute("src"), /jp.svg$/);
      assert.equal(await button("Gold marker").getAttribute("aria-pressed"), "true");

      for (const error of [404, 500, "network"]) {
        await action("Delete");
        failure = error;
        const count = writes.length;
        await button("Delete capital").click();
        await focus(dialog.getByRole("alert"));
        assert.equal(writes.length, count + 1);
        assert.equal((await state()).capitals.length, 3);
        assert.equal((await state()).selectedCapitalId, 1);
        assert.equal(await marker(1).count(), 1);
        assert.equal(await page.locator(".mutation-notice").textContent(), "");
        await button("Cancel").click();
        await closed();
        await focus(trigger());
      }
      failure = null;
      await action("Delete");
      hold = true;
      const deleting = new Promise(resolve => { entered = resolve; });
      const beforeDelete = await camera(), deleteCount = writes.length;
      await button("Delete capital").click();
      await deleting;
      await button("Deleting…").waitFor();
      assert.equal(await button("Deleting…").isDisabled(), true);
      await page.keyboard.press("Escape");
      assert.equal((await state()).capitals.length, 3);
      hold = false;
      release();
      await closed();
      await focus(collapsed ? page.locator(".mapboxgl-canvas") : button("Add capital"));
      assert.equal(writes.length, deleteCount + 1);
      assert.equal(await page.locator('.capital-marker[aria-label^="Tokyo copy,"]').count(), 0);
      assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
      assert.equal((await state()).selectedCapitalId, null);
      assert.equal((await state()).capitals.length, 2);
      assert.equal(await page.locator(".mutation-notice").textContent(), "Capital deleted.");
      assert.deepEqual(await camera(), beforeDelete);

      // Long content at the map edge, default close control, touch activation,
      // switching markers and unmount all dispose the single active menu.
      if (collapsed) await button("Expand sidebar").click();
      await page.getByRole("searchbox").fill("");
      await button("Reset to default").click();
      await button("Reset capitals").click();
      await closed();
      if (collapsed) await button("Collapse sidebar").click();
      await openMarker(3);
      assert.deepEqual(await facts(), ["Asia, Europe", "0", "An exceptionally long currency name that must wrap safely inside the small popup (EUR), JPY, US dollar (USD)"]);
      assert.equal(await popupBounds(), true);
      assert.deepEqual(await popupLayout(), expectedLayout);
      assert.equal(await page.locator(".popup-facts dd").last().evaluate(el => el.getBoundingClientRect().height > 36), true);
      // Even when long text needs internal scrolling, every swatch and the
      // header action can be reached without horizontal overflow.
      await button("Gold marker").scrollIntoViewIfNeeded();
      await button("Gold marker").click();
      await trigger().scrollIntoViewIfNeeded();
      await trigger().click();
      assert.equal(await page.evaluate(() => {
        const title = document.querySelector(".capital-popup h2").getBoundingClientRect();
        const trigger = document.querySelector(".popup-actions-trigger").getBoundingClientRect();
        const close = document.querySelector(".mapboxgl-popup-close-button").getBoundingClientRect();
        const menu = document.querySelector(".capital-actions-menu").getBoundingClientRect();
        return title.right <= trigger.left && trigger.right <= close.left && trigger.width >= 40 && trigger.height >= 40
          && Math.abs(trigger.top - close.top) <= 2 && Math.abs(trigger.height - close.height) <= 2
          && menu.left >= 0 && menu.right <= innerWidth && menu.top >= 0 && menu.bottom <= innerHeight;
      }), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
      if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/popup-actions-${width}-${collapsed ? "collapsed" : "open"}.png` });
      await button("Close popup").click();
      assert.equal(await menu.count(), 0);
      assert.equal(await page.evaluate(() => window.actionListeners.size), 0);
      // A touch-capable context is supplied by the runner for this suite.
      await openMarker(2);
      await trigger().tap();
      await button("Edit").tap();
      await dialog.waitFor();
      await button("Cancel").tap();
      await closed();
      await focus(trigger());
      await trigger().click();
      await marker(3).evaluate(el => el.click());
      assert.equal(await menu.count(), 0);
      assert.equal(await page.evaluate(() => window.actionListeners.size), 0);
      assert.equal(await page.locator(".mapboxgl-popup").count(), 1);
      assert.equal(await page.evaluate(() => window.originalPopupMap === window.popupMap
        && window.originalPopupCanvas === document.querySelector(".mapboxgl-canvas") && window.popupMaps === 1), true);
      assert.equal(await page.locator(".capital-marker").evaluateAll(elements => elements.every(el => el.offsetWidth === 32 && el.offsetHeight === 32)), true);
      // A refresh can remove the original marker while an editor is open.
      // Cancel still has a visible focus destination and never writes.
      await action("Edit");
      records = records.filter(capital => capital.id !== 3);
      await page.evaluate(async () => {
        const { useCapitalStore } = await import("/src/capital-store.ts");
        await useCapitalStore.getState().fetchCapitals();
      });
      assert.equal(await trigger().count(), 0);
      assert.equal(await dialog.count(), 1);
      await button("Cancel").click();
      await closed();
      await focus(collapsed ? page.locator(".mapboxgl-canvas") : button("Add capital"));
      await openMarker(2);
      await trigger().click();
      await page.evaluate(() => window.popupRoot.unmount());
      assert.equal(await page.evaluate(() => window.actionListeners.size), 0);
      assert.equal(await menu.count(), 0);
      await page.evaluate(() => { document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" })); window.dispatchEvent(new Event("resize")); });
      evidence.push({ width, height, collapsed, keyboardAndTouch: true, sharedCrud: true, errorsAndPending: true,
        filterAndSearch: true, focusAndCleanup: true, cameraAndMapPreserved: true, overflow: false });
    }
  }
  assert.deepEqual(errors, []);
  return { viewports: evidence, mockedWrites: writes.length, pageErrors: errors };
}
