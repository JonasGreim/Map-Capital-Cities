import { chooseContinent, continentValue } from "./continent-helpers.mjs";
/* global window, document, innerWidth, innerHeight, getComputedStyle */
import assert from "node:assert/strict";

// Real Mapbox in a fresh context; all capital traffic is controlled, never DB-backed.
export async function verifySidebarRail(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(15000);
  const records = [
    { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, flagCode: "DE", continents: ["Europe"] },
    ...Array.from({ length: 25 }, (_, i) => ({ id: i + 10, name: `Capital ${i}`, country: `Country ${i}`, latitude: 30 + i / 10, longitude: -30 + i, continents: ["Europe"] })),
    { id: 2, name: "Prague", country: "Czechia", latitude: 50.07, longitude: 14.43, flagCode: "CZ", continents: ["Europe"] },
    { id: 3, name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.69, flagCode: "JP", continents: ["Asia"] },
  ];
  let reads = 0, writes = 0;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/capital{,-reset,/*}", route => {
    if (route.request().method() === "GET") reads++; else writes++;
    return route.fulfill({ json: records });
  });
  await page.route("**/src/Map.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    assert.ok(source.includes("const failed ="));
    await route.fulfill({ response, body: source.replace("const failed =", "window.railMap = map; window.railCreations = (window.railCreations || 0) + 1; const failed =") });
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const focused = async locator => page.waitForFunction(el => el === document.activeElement, await locator.elementHandle());
  const idle = () => page.waitForFunction(() => window.railMap && !window.railMap.isMoving()
    && window.railMap.getCanvas().clientWidth === window.railMap.getContainer().clientWidth
    && window.railMap.getCanvas().clientHeight === window.railMap.getContainer().clientHeight);
  const shot = async name => { if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/${name}.png` }); };
  const search = page.getByRole("searchbox", { name: "Search countries or capitals", exact: true });
  const panel = page.getByRole("dialog", { name: "Search capitals", exact: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(baseURL);
  await page.waitForFunction(() => window.railMap?.isStyleLoaded());
  await page.locator(".capital-marker").last().waitFor();
  await idle();
  const initialReads = reads, initialCreations = await page.evaluate(() => window.railCreations);
  await page.evaluate(() => { window.railCanvas = document.querySelector("canvas"); window.railMarkers = [...document.querySelectorAll(".capital-marker")]; });
  const evidence = [];
  for (const [width, height] of [[1440, 900], [1024, 768], [701, 700], [1024, 360]]) {
    await page.setViewportSize({ width, height });
    await idle();
    assert.equal(await page.locator(".app > .app-header").count(), 0);
    assert.equal(await page.locator("#capital-sidebar").evaluate(el => Math.round(el.getBoundingClientRect().width)), 352);
    assert.equal(await page.locator(".map-panel").evaluate(el => el.getBoundingClientRect().top === 0 && el.clientHeight === innerHeight), true);
    await search.fill("");
    await chooseContinent(page, "Europe");
    await shot(`desktop-expanded-${width}-${height}`);
    if (width === 1440) await shot("desktop-expanded");
    await page.locator("#capital-sidebar .list-content").evaluate(el => { el.scrollTop = 200; });
    const scroll = await page.locator("#capital-sidebar .list-content").evaluate(el => el.scrollTop);
    await button("Collapse sidebar").click();
    await focused(button("Expand sidebar"));
    await idle();
    assert.equal(await page.locator("#capital-sidebar").isVisible(), false);
    assert.equal(await page.locator("#capital-search").evaluate(el => { el.focus(); return el === document.activeElement; }), false);
    assert.equal(await page.locator(".sidebar-rail").evaluate(el => el.clientWidth >= 56 && el.clientWidth <= 72), true);
    assert.deepEqual(await page.locator(".sidebar-rail button").evaluateAll(elements => elements.map(el => el.getAttribute("aria-label"))), ["Search capitals", "Add capital", "Show capital list"]);
    assert.equal(await page.getByRole("link", { name: "Map Capital Cities – Home" }).getAttribute("href"), "/");
    assert.equal(await page.locator(".sidebar-rail .brand-globe").evaluate(el => {
      const globe = el.getBoundingClientRect(), toggle = document.querySelector(".sidebar-toggle").getBoundingClientRect();
      return globe.right < toggle.left;
    }), true);
    assert.equal(await button("Search capitals").evaluate(el => getComputedStyle(el).backgroundColor), "rgba(0, 0, 0, 0)");
    if (width === 1440) await shot("desktop-collapsed");
    await button("Search capitals").focus(); await page.keyboard.press("Enter");
    await focused(search);
    assert.equal(await button("Search capitals").getAttribute("aria-expanded"), "true");
    await search.fill("pRaGuE");
    assert.equal(await panel.locator(".capital-label").count(), 1);
    assert.equal(await page.locator(".capital-marker:not([hidden])").count(), 27);
    assert.equal(await panel.evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), true);
    await shot(`desktop-search-${width}-${height}`);
    if (width === 1440) await shot("desktop-search-popover");
    await page.keyboard.press("Escape"); await focused(button("Search capitals"));
    assert.equal(await panel.count(), 0);
    await button("Search capitals").click(); await focused(search);
    assert.equal(await search.inputValue(), "pRaGuE");
    await page.locator(".map-panel").click({ position: { x: 100, y: height - 20 } });
    assert.equal(await panel.count(), 0);
    await button("Search capitals").click();
    await search.fill(""); await button("Clear search").waitFor({state:"hidden"});
    // Dismiss by Tab leaving the non-modal panel, without trapping focus.
    await panel.locator(".capital-label").last().focus(); await page.keyboard.press("Tab");
    assert.equal(await panel.count(), 0);
    await button("Search capitals").click(); await search.fill("pRaGuE");
    await page.keyboard.press("Tab"); await focused(button("Clear search"));
    await page.keyboard.press("Tab"); await focused(button("Show Prague, Czechia on map"));
    await page.keyboard.press("Enter");
    await page.locator(".capital-popup").waitFor(); await idle();
    assert.equal(await panel.count(), 0);
    assert.equal(await page.locator("#capital-sidebar").isVisible(), false);
    assert.equal(await page.locator(".capital-popup h2").textContent(), "Prague");
    await button("Purple marker").click();
    await button("Add capital").click();
    await page.getByRole("dialog", { name: "Add a New Capital City", exact: true }).waitFor();
    await focused(page.getByLabel("Capital name", { exact: true }));
    await page.keyboard.press("Escape"); await focused(button("Add capital"));
    assert.equal(await page.locator("#capital-sidebar").isVisible(), false);
    await button("Show capital list").click();
    await focused(page.getByRole("region", { name: "Capital results" }));
    assert.equal(await page.locator("#capital-sidebar .list-content").evaluate(el => { const r = el.getBoundingClientRect(); return r.top < innerHeight && r.bottom > 0; }), true);
    assert.equal(await search.inputValue(), "pRaGuE");
    assert.equal(await continentValue(page), "Europe");
    // No selection in these toggles: the existing list's scroll must survive.
    await search.fill("");
    await page.locator("#capital-sidebar .list-content").evaluate(el => { el.scrollTop = 200; });
    const savedScroll = await page.locator("#capital-sidebar .list-content").evaluate(el => el.scrollTop);
    await idle();
    const camera = await page.evaluate(() => { const c = window.railMap.getCenter(); return [c.lng, c.lat, window.railMap.getZoom()]; });
    for (let i = 0; i < 3; i++) {
      await button("Collapse sidebar").click(); await button("Expand sidebar").click();
      assert.equal(await page.locator("#capital-sidebar .list-content").evaluate(el => el.scrollTop), savedScroll);
    }
    assert.ok(scroll > 0);
    await idle();
    assert.deepEqual(await page.evaluate(() => { const c = window.railMap.getCenter(); return [c.lng, c.lat, window.railMap.getZoom()]; }), camera);
    assert.equal(await button("Purple marker").getAttribute("aria-pressed"), "true");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator(".capital-marker").first().evaluate(el => el.offsetWidth === 32 && el.offsetHeight === 32 && getComputedStyle(el).borderRadius === "0px"), true);
    assert.equal(await page.evaluate(() => window.railCanvas === document.querySelector("canvas") && window.railMarkers.every((el, i) => el === document.querySelectorAll(".capital-marker")[i])), true);
    evidence.push({ width, height, sharedSearch: true, keyboard: true, scrollPreserved: true, realMapResized: true });
  }
  // Crossing the breakpoint closes the transient overlay and keeps the shared query.
  await button("Collapse sidebar").click(); await button("Search capitals").click(); await search.fill("Berlin");
  for (const width of [390, 320]) {
    await page.setViewportSize({width, height: width === 390 ? 844 : 568});
    await page.getByRole("tab", {name:"Capitals",exact:true}).click();
    assert.equal(await page.locator(".sidebar-rail").count(), 0);
    assert.equal(await panel.count(), 0);
    assert.equal(await page.locator(".app > .app-header").isVisible(), true);
    assert.equal(await search.inputValue(), "Berlin");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await shot(`mobile-capitals-${width}`);
    await page.getByRole("tab",{name:"Map",exact:true}).click(); await idle();
    await shot(`mobile-map-${width}`);
  }
  assert.equal(reads, initialReads);
  assert.equal(writes, 0);
  assert.equal(await page.evaluate(() => window.railCreations), initialCreations);
  assert.deepEqual(errors, []);
  return { evidence, reads, writes, mapCreations: initialCreations, pageErrors: errors };
}
