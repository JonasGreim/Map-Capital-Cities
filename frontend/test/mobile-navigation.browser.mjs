import { chooseContinent, continentValue } from "./continent-helpers.mjs";
/* global window, document, innerWidth, innerHeight */
import assert from "node:assert/strict";

// A fresh context, real Mapbox, and controlled reads/writes. No DB is contacted.
export async function verifyMobileNavigation(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(15000);
  const defaults = [
    { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, continents: ["Europe"] },
    ...Array.from({ length: 28 }, (_, i) => ({ id: i + 10, name: `Capital ${i}`, country: `Country ${i}`, latitude: -30, longitude: -50 + i })),
    { id: 2, name: "Prague", country: "Czechia", latitude: 50.07, longitude: 14.43, continents: ["Europe"] },
    { id: 3, name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.69, continents: ["Asia"] },
  ];
  let records = [...defaults], gets = 0, writes = 0, fail = false;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/capital{,-reset,/*}", route => {
    const req = route.request(), method = req.method();
    if (method === "GET") { gets++; return route.fulfill({ json: records }); }
    writes++;
    if (fail) return route.fulfill({ status: 503 });
    if (req.url().endsWith("capital-reset")) { records = [...defaults]; return route.fulfill({ json: records }); }
    const id = Number(req.url().split("/").pop());
    if (method === "DELETE") { records = records.filter(c => c.id !== id); return route.fulfill({ status: 204 }); }
    const saved = { ...req.postDataJSON(), id: method === "POST" ? 100 : id };
    records = records.filter(c => c.id !== saved.id).concat(saved);
    return route.fulfill({ status: method === "POST" ? 201 : 200, json: saved });
  });
  await page.route("**/src/Map.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    const anchor = "const failed =";
    assert.ok(source.includes(anchor));
    const inspect = `window.mobileMap = map; window.mapCreations = (window.mapCreations || 0) + 1;
      const listeners = new globalThis.Map();
      const on = map.on.bind(map), off = map.off.bind(map);
      map.on = (type, listener, ...args) => { if (typeof listener === 'function') { if (!listeners.has(type)) listeners.set(type,new Set()); listeners.get(type).add(listener); } return on(type,listener,...args); };
      map.off = (type, listener, ...args) => { listeners.get(type)?.delete(listener); return off(type,listener,...args); };
      window.mobileListenerCounts = () => [...listeners].map(([type,values]) => [type,values.size]).filter(([,size]) => size).sort();
      window.mobileEvents = []; const fly = map.flyTo.bind(map), resize = map.resize.bind(map);
      map.resize = (...args) => { window.mobileEvents.push({kind:'resize', width:map.getContainer().clientWidth, height:map.getContainer().clientHeight}); return resize(...args); };
      map.flyTo = (options, ...args) => { window.mobileEvents.push({kind:'fly', center:options.center, duration:options.duration, width:map.getCanvas().clientWidth, height:map.getCanvas().clientHeight, visible:!map.getContainer().closest('[hidden]')}); return fly(options, ...args); };`;
    await route.fulfill({ response, body: source.replace(anchor, `${inspect}\n${anchor}`) });
  });
  const tab = name => page.getByRole("tab", { name, exact: true });
  const button = name => page.getByRole("button", { name, exact: true });
  const capitals = () => tab("Capitals").click();
  const map = () => tab("Map").click();
  const field = name => page.getByLabel(name, { exact: true });
  const search = page.getByRole("searchbox");
  const row = name => page.locator(".capital-label").filter({ hasText: name });
  const idle = () => page.waitForFunction(() => window.mobileMap && !window.mobileMap.isMoving()
    && window.mobileMap.getCanvas().clientWidth === window.mobileMap.getContainer().clientWidth);
  const focused = async locator => assert.equal(await locator.evaluate(el => el === document.activeElement), true);
  const shot = async name => { if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/${name}.png` }); };
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(baseURL);
  await page.locator(".capital-marker").last().waitFor();
  await page.waitForFunction(() => window.mobileMap?.isStyleLoaded());
  await idle();
  assert.equal(await tab("Map").getAttribute("aria-selected"), "true");
  assert.equal(await search.isVisible(), false);
  assert.equal(await button("Collapse sidebar").isVisible(), false);
  await page.evaluate(() => { window.savedCanvas = document.querySelector("canvas"); window.savedMarkers = [...document.querySelectorAll(".capital-marker")]; });
  const initialListeners = await page.evaluate(() => window.mobileListenerCounts());
  const initialGets = gets;
  const initialCreations = await page.evaluate(() => window.mapCreations);
  await shot("mobile-map-390");
  // Automatic activation and roving tab stop; manual switches retain tab focus.
  await tab("Map").focus();
  await page.keyboard.press("ArrowRight");
  await focused(tab("Capitals"));
  assert.equal(await tab("Capitals").getAttribute("aria-selected"), "true");
  assert.equal(await page.locator("#world-map").getAttribute("hidden"), "");
  assert.equal(await page.locator(".mapboxgl-canvas").evaluate(el => { el.focus(); return el === document.activeElement; }), false);
  await shot("mobile-capitals-390");
  await page.keyboard.press("Home"); await focused(tab("Map"));
  await page.keyboard.press("End"); await focused(tab("Capitals"));
  await page.keyboard.press("Enter"); await focused(tab("Capitals"));
  await search.fill("Berlin");
  await chooseContinent(page, "Europe");
  await shot("mobile-search-390");
  for (const reducedMotion of ["no-preference", "reduce", "reduce"]) {
    await page.emulateMedia({ reducedMotion });
    await capitals();
    await row("Berlin").click();
    await page.locator(".capital-popup").waitFor();
    await idle();
    assert.equal(await tab("Map").getAttribute("aria-selected"), "true");
    const events = await page.evaluate(() => window.mobileEvents);
    const last = events.findLastIndex(event => event.kind === "fly");
    assert.ok(last > 0);
    assert.equal(events[last - 1].kind, "resize");
    assert.deepEqual(events[last].center, [13.405, 52.52]);
    assert.equal(events[last].duration, reducedMotion === "reduce" ? 0 : 900);
    assert.equal(events[last].visible, true);
    assert.ok(events[last].width > 0 && events[last].height > 0);
    await focused(button("Teal marker"));
    assert.equal(gets, initialGets);
  }
  await button("Purple marker").click();
  await shot("mobile-popup-390");
  const camera = await page.evaluate(() => { const c = window.mobileMap.getCenter(); return [c.lng, c.lat, window.mobileMap.getZoom()]; });
  const flightsBeforeSwitch = await page.evaluate(() => window.mobileEvents.filter(event => event.kind === "fly").length);
  await capitals();
  assert.equal(await search.inputValue(), "Berlin");
  assert.equal(await continentValue(page), "Europe");
  await map(); await idle();
  assert.deepEqual(await page.evaluate(() => { const c = window.mobileMap.getCenter(); return [c.lng, c.lat, window.mobileMap.getZoom()]; }), camera);
  assert.equal(await button("Purple marker").getAttribute("aria-pressed"), "true");
  assert.equal(await page.evaluate(() => window.mobileEvents.filter(event => event.kind === "fly").length), flightsBeforeSwitch);
  await capitals(); await search.fill(""); await chooseContinent(page, "");
  await page.locator(".list-content").evaluate(el => { el.scrollTop = 300; });
  const scroll = await page.locator(".list-content").evaluate(el => el.scrollTop);
  await map(); await capitals();
  assert.equal(await page.locator(".list-content").evaluate(el => el.scrollTop), scroll);
  // Marker selection stays on Map; opening Capitals reveals its row internally.
  await map();
  await page.locator('.capital-marker[aria-label^="Prague,"]').dispatchEvent("click");
  await idle();
  assert.equal(await tab("Map").getAttribute("aria-selected"), "true");
  await capitals();
  assert.equal(await row("Prague").getAttribute("aria-pressed"), "true");
  assert.equal(await row("Prague").evaluate(el => { const r = el.getBoundingClientRect(), p = el.closest(".list-content").getBoundingClientRect(); return r.top >= p.top && r.bottom <= p.bottom; }), true);
  await page.locator(".list-content").evaluate(el => { el.scrollTop = 42; });
  await map(); await capitals();
  assert.equal(await page.locator(".list-content").evaluate(el => el.scrollTop), 42);
  await search.fill("Berlin"); await map(); await capitals();
  assert.equal(await search.inputValue(), "Berlin");
  assert.equal(await page.locator("li[data-selected]").count(), 0);
  await map(); await button("Close popup").click(); await capitals();
  assert.deepEqual(await page.evaluate(() => window.mobileListenerCounts()), initialListeners);
  // Create, validation, server failure, picker draft/Cancel/Escape and explicit save.
  await button("Add capital").click();
  await button("Create capital").click(); await focused(field("Capital name"));
  await field("Capital name").fill("Mobile city"); await field("Country name").fill("Mobile country");
  await button("Select on map").click();
  await page.locator(".coordinate-pick-banner").waitFor();
  assert.equal(await tab("Map").getAttribute("aria-selected"), "true");
  await button("Cancel").click(); await focused(button("Select on map"));
  assert.equal(await tab("Capitals").getAttribute("aria-selected"), "true");
  await button("Select on map").click(); await page.keyboard.press("Escape"); await focused(button("Select on map"));
  await button("Select on map").click();
  await page.locator(".coordinate-pick-banner").waitFor();
  await idle();
  const bounds = await page.locator(".mapboxgl-canvas").boundingBox();
  await page.mouse.click(bounds.x + bounds.width * 0.65, bounds.y + bounds.height * 0.65);
  await page.locator("dialog[open]").waitFor();
  assert.equal(await field("Capital name").inputValue(), "Mobile city");
  assert.ok(await field("Latitude").inputValue());
  assert.equal(writes, 0);
  await focused(field("Latitude"));
  await shot("mobile-form-390");
  fail = true; await button("Create capital").click(); await page.locator("dialog [role=alert]").waitFor();
  fail = false; await button("Create capital").click(); await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await focused(button("Add capital"));
  assert.equal(await page.locator(".mutation-notice").textContent(), "Capital created.");
  assert.equal(await page.locator(".mutation-notice").evaluate(el => el.getBoundingClientRect().bottom < document.querySelector(".mobile-navigation").getBoundingClientRect().top), true);
  await button("Actions for Berlin").click(); await button("Edit").click(); await button("Save changes").click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await focused(button("Actions for Berlin"));
  await search.fill("Mobile city");
  await button("Actions for Mobile city").click(); await button("Delete").click(); await button("Cancel").click();
  await button("Actions for Mobile city").click(); await button("Delete").click(); await button("Delete capital").click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" }); await focused(button("Add capital"));
  await button("Reset to default").click(); await button("Cancel").click();
  await focused(button("Reset to default"));
  await button("Reset to default").click(); await button("Reset capitals").click();
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await search.fill("");
  const evidence = [];
  // Both breakpoint directions, short landscape and desktop sidebar independence.
  for (const [width, height] of [[1440,900], [768,1024], [700,844], [390,844], [320,568], [667,375], [701,844], [390,844]]) {
    await page.setViewportSize({ width, height });
    await page.waitForFunction(mobile => document.getElementById("world-map").getAttribute("role") === (mobile ? "tabpanel" : null), width <= 700);
    if (width > 700) {
      assert.equal(await page.locator("#capital-sidebar").isVisible(), true);
      await button("Collapse sidebar").click();
      assert.equal(await search.isVisible(), false);
      await button("Expand sidebar").click();
      if (width === 1440) await shot("desktop-1440");
    } else {
      await capitals();
      await button("Add capital").click();
      await button("Cancel").scrollIntoViewIfNeeded(); await button("Cancel").click();
      assert.equal(await page.locator(".mobile-navigation").evaluate(el => el.getBoundingClientRect().bottom === innerHeight), true);
      assert.equal(await page.evaluate(() => document.documentElement.scrollHeight <= innerHeight), true);
      await shot(`mobile-capitals-${width}-${height}`);
      await map();
      await capitals(); await row("Berlin").click(); await idle();
      await page.locator(".capital-popup").evaluate(el => { el.scrollTop = 0; });
      assert.equal(await button("Map actions for Berlin").isVisible(), true);
      await button("Gold marker").scrollIntoViewIfNeeded();
      await button("Gold marker").click();
      assert.equal(await page.locator(".mapboxgl-popup").evaluate(el => {
        const r = el.getBoundingClientRect(), p = document.getElementById("world-map").getBoundingClientRect();
        return r.left >= p.left - 1 && r.right <= p.right + 1 && r.top >= p.top - 1 && r.bottom <= p.bottom + 1;
      }), true, `popup bounds ${width}x${height}`);
      await shot(`mobile-popup-${width}-${height}`);
    }
    await idle();
    const geometry = await page.evaluate(() => ({
      width: innerWidth, height: innerHeight,
      overflowX: document.documentElement.scrollWidth > innerWidth,
      overflowY: document.documentElement.scrollHeight > innerHeight,
      square: [...document.querySelectorAll(".capital-marker:not([hidden])")].every(el => el.offsetWidth === 32 && el.offsetHeight === 32),
      sameCanvas: window.savedCanvas === document.querySelector("canvas"),
      sameMarkers: window.savedMarkers.every(el => el === document.querySelector(`.capital-marker[aria-label="${el.getAttribute('aria-label')}"]`)),
      creations: window.mapCreations,
      hiddenFocus: !!document.activeElement.closest("[hidden]"),
      attribution: document.querySelector(".mapboxgl-ctrl-attrib").getBoundingClientRect().bottom <= document.getElementById("world-map").getBoundingClientRect().bottom,
    }));
    assert.deepEqual({ ...geometry, width: 0, height: 0 }, { width: 0, height: 0, overflowX: false, overflowY: false, square: true, sameCanvas: true, sameMarkers: true, creations: initialCreations, hiddenFocus: false, attribution: true });
    evidence.push(geometry);
  }
  // Desktop collapse state survives a round trip through the independent tabs.
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.getElementById("world-map").getAttribute("role") === null);
  await button("Collapse sidebar").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await capitals();
  assert.equal(await search.isVisible(), true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.waitForFunction(() => document.getElementById("world-map").getAttribute("role") === null);
  assert.equal(await search.isVisible(), false);
  await button("Expand sidebar").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await map();
  // A native reset modal remains visible when its list pane becomes hidden.
  await page.setViewportSize({ width: 1440, height: 900 });
  await button("Reset to default").click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("dialog", { name: "Reset to default", exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await page.locator("dialog[open]").waitFor({ state: "hidden" });
  await page.waitForFunction(() => document.activeElement === document.querySelector(".mapboxgl-canvas") || document.activeElement?.id === "map-tab");
  const session = await page.context().newCDPSession(page);
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 34 } });
  await page.waitForFunction(() => document.querySelector(".mobile-navigation").getBoundingClientRect().height === 98);
  assert.equal(await page.locator("#world-map").evaluate(el => el.getBoundingClientRect().bottom <= document.querySelector(".mobile-navigation").getBoundingClientRect().top), true);
  await session.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 0 } });
  await session.detach();
  assert.equal(gets, initialGets);
  assert.deepEqual(errors, []);
  return { viewports: evidence, gets, writes, keyboard: true, repeatedSelectionAndResizeOrder: true, pickerCrudAndFocus: true, errors };
}
