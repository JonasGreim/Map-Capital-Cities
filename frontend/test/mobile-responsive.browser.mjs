import { chooseContinent, continentValue } from "./continent-helpers.mjs";
/* global window, document, innerWidth, innerHeight, getComputedStyle */
import assert from "node:assert/strict";
import { showView } from "./view-helpers.mjs";

// Real Mapbox/Chromium; intercept every capital read/write before navigation.
export async function verifyMobileResponsive(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(15000);
  const defaults = [
    { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, flagCode: "DE", continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] },
    { id: 2, name: `São Tomé – Éléonore ${"Verylongunbrokencapitalname".repeat(3)}`, country: `République très longue ${"Extremelylongunbrokencountry".repeat(3)}`, latitude: 0, longitude: 0, continents: ["Asia", "Europe"], population: 123456789,
      currencies: [{ code: "EUR", name: "An exceptionally long currency name that must wrap safely inside the small popup" }, { code: "USD", name: "US dollar" }] },
    { id: 3, name: "Unknown city", country: "Unknown country", latitude: 10, longitude: 10 },
    ...Array.from({ length: 30 }, (_, i) => ({ id: i + 10, name: `Capital ${i}`, country: `Country ${i}`, latitude: -20, longitude: i - 50 })),
  ];
  let records = [...defaults], gets = 0, writes = 0;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/capital{,-reset,/*}", route => {
    const req = route.request();
    if (req.method() === "GET") { gets++; return route.fulfill({ json: records }); }
    writes++;
    // This scenario creates one record; any unexpected write is a test error.
    assert.equal(req.method(), "POST"); assert.ok(req.url().endsWith("/capital"));
    const saved = { ...req.postDataJSON(), id: 100 };
    records = [...records, saved];
    return route.fulfill({ status: 201, json: saved });
  });
  await page.route("**/src/Map.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    assert.ok(source.includes("const failed ="));
    await route.fulfill({ response, body: source.replace("const failed =", `
      window.responsiveMap = map; window.responsiveCreations = (window.responsiveCreations || 0) + 1;
      window.responsiveFlights = []; const fly = map.flyTo.bind(map);
      map.flyTo = (options, ...rest) => { window.responsiveFlights.push(options); return fly(options, ...rest); };
      const failed =`) });
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const shot = async name => { if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/${name}.png` }); };
  const idle = () => page.waitForFunction(() => window.responsiveMap && !window.responsiveMap.isMoving()
    && window.responsiveMap.getCanvas().clientWidth === window.responsiveMap.getContainer().clientWidth
    && window.responsiveMap.getCanvas().clientHeight === window.responsiveMap.getContainer().clientHeight);
  const resize = async (width, height) => {
    await page.setViewportSize({ width, height });
    if (await page.locator("#world-map").count()) await page.waitForFunction(mobile => document.getElementById("world-map").getAttribute("role") === (mobile ? "tabpanel" : null), width <= 700);
  };
  // Actual clipping ancestors and hit testing, not just DOM visibility.
  const reachable = async (locator, hitTest = true) => {
    assert.equal(await locator.evaluate((el, hitTest) => {
      const r = el.getBoundingClientRect();
      if (r.width <= 0 || r.height <= 0 || r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) return false;
      for (let parent = el.parentElement; parent; parent = parent.parentElement) {
        const style = getComputedStyle(parent), p = parent.getBoundingClientRect();
        if (/(auto|scroll|hidden|clip)/.test(style.overflowY) && (r.top < p.top - 1 || r.bottom > p.bottom + 1)) return false;
        if (/(auto|scroll|hidden|clip)/.test(style.overflowX) && (r.left < p.left - 1 || r.right > p.right + 1)) return false;
      }
      return !hitTest || el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }, hitTest), true, `clipped or covered at ${JSON.stringify(page.viewportSize())}: ${await locator.getAttribute("aria-label") ?? await locator.textContent()}`);
  };
  const shell = async () => {
    assert.deepEqual(await page.evaluate(() => ({
      x: document.documentElement.scrollWidth > innerWidth, y: document.documentElement.scrollHeight > innerHeight,
      hiddenFocus: !!document.activeElement.closest("[hidden]"), creations: window.responsiveCreations,
      canvas: window.responsiveCanvas === document.querySelector("canvas"), markers: window.responsiveMarkers.every(el => el.isConnected),
      square: [...document.querySelectorAll(".capital-marker")].every(el => {
        const style = getComputedStyle(el);
        return style.width === "32px" && style.height === "32px"
          && (!el.getClientRects().length || (el.offsetWidth === 32 && el.offsetHeight === 32));
      }),
    })), { x: false, y: false, hiddenFocus: false, creations: 1, canvas: true, markers: true, square: true });
  };
  const bounds = async () => {
    const geometry = await page.locator(".mapboxgl-popup").evaluate(el => {
      const r = el.getBoundingClientRect(), map = document.getElementById("world-map").getBoundingClientRect();
      return { fits: r.top >= map.top - 1 && r.bottom <= map.bottom + 1 && r.left >= map.left - 1 && r.right <= map.right + 1,
        popup: r.toJSON(), map: map.toJSON(), zoom: window.responsiveMap.getZoom() };
    });
    assert.equal(geometry.fits, true, `popup outside map at ${JSON.stringify(page.viewportSize())}: ${JSON.stringify(geometry)}`);
    await reachable(button("Close popup"));
  };
  await resize(390, 844); await page.emulateMedia({ reducedMotion: "reduce" }); await page.goto(baseURL);
  await page.waitForFunction(() => window.responsiveMap?.isStyleLoaded()); await page.locator(".capital-marker").last().waitFor();
  await page.evaluate(() => { window.responsiveCanvas = document.querySelector("canvas"); window.responsiveMarkers = [...document.querySelectorAll(".capital-marker")]; });
  await shot("responsive-map-390");
  const matrix = [];
  for (const [width, height] of [[1440,900], [768,1024], [701,844], [700,844], [390,844], [375,667], [320,568], [667,375], [568,320]]) {
    await resize(width, height); await showView(page, "Capitals"); await page.getByRole("searchbox").fill("");
    // Short landscape intentionally scrolls the whole sidebar internally too.
    for (const locator of [page.getByRole("searchbox"), page.getByLabel("Continent", { exact: true }), button("Add capital"), button("Reset to default"), page.locator(".capital-list li").last().locator(".actions-trigger")]) {
      await locator.scrollIntoViewIfNeeded(); await reachable(locator);
    }
    if (width === 390 || width === 667) {
      await page.locator(".sidebar").evaluate(el => el.scrollTop = 0); await page.locator(".list-content").evaluate(el => el.scrollTop = 0);
      await shot(`responsive-capitals-${width}`);
    }
    await shell();
    for (const capital of defaults.slice(0, 3)) {
      await showView(page, "Capitals"); await page.locator(".capital-label").nth(capital.id - 1).click();
      await idle(); await bounds();
      const selectedColor = page.locator('.color-swatch[aria-pressed="true"]');
      assert.equal(await selectedColor.evaluate(el => el === document.activeElement), true);
      await reachable(selectedColor); // Initially focused swatch must be visible.
      assert.equal(await page.locator(".capital-popup").evaluate(el => el.scrollWidth <= el.clientWidth), true);
      for (const color of ["Teal", "Red", "Purple", "Gold"]) {
        await button(`${color} marker`).scrollIntoViewIfNeeded(); await reachable(button(`${color} marker`)); await button(`${color} marker`).click();
      }
      if (capital.id === 1 && width === 667) {
        for (const selector of [".capital-popup h2", ".popup-country", ".capital-popup > .country-flag", ".popup-actions-trigger"]) await reachable(page.locator(selector));
      }
      if ([390,320,667,568].includes(width)) await shot(`responsive-popup-${capital.id}-${width}-${height}`);
      // Context/menu remain reachable by scrolling back; no sticky overlay.
      await page.locator(".capital-popup").evaluate(el => el.scrollTop = 0); await reachable(page.locator(".popup-actions-trigger"));
      await page.locator(".popup-actions-trigger").click(); await reachable(button("Edit")); await page.keyboard.press("Escape");
      await bounds(); await shell(); await button("Close popup").click();
    }
    await showView(page, "Map"); await idle();
    const attribution = page.locator(".mapboxgl-ctrl-attrib-button");
    if (await attribution.isVisible()) {
      await reachable(attribution);
      // Mapbox can retain aria-expanded across a responsive compact reset.
      if (!await page.locator(".mapboxgl-ctrl-attrib-inner").isVisible()) await attribution.click();
    }
    await reachable(page.locator(".mapboxgl-ctrl-attrib a").first());
    if (await attribution.isVisible()) await attribution.click();
    if (width === 1440) await shot("responsive-desktop-1440");
    // Real marker clicks at every edge/corner settle after at most one flyTo.
    // Keep the bottom-right corner target beside the fixed attribution button.
    for (const [x, y] of [[0.5,0.1], [0.5,0.9], [0.1,0.5], [0.9,0.5], [0.1,0.1], [0.9,0.1], [0.1,0.9], [0.7,0.9]]) {
      const before = await page.evaluate(([x,y]) => {
        const map = window.responsiveMap;
        map.jumpTo({ center: [13.405,52.52], zoom: 3 });
        map.panBy([map.getContainer().clientWidth * (0.5-x), map.getContainer().clientHeight * (0.5-y)], { duration: 0 });
        return window.responsiveFlights.length;
      }, [x,y]);
      await page.locator('.capital-marker[aria-label^="Berlin,"]').click(); await idle(); await bounds();
      assert.ok(await page.evaluate(() => window.responsiveFlights.length) - before <= 1, "repeat fit flights");
      await button("Close popup").click();
    }
    matrix.push({ width, height, overflow: false, popupAndEdges: true, longContent: true });
  }
  // Reduced viewport simulates keyboard space, not native iOS/Android behavior.
  await resize(390,844); await showView(page,"Capitals");
  const search = page.getByRole("searchbox");
  await search.fill("Berlin"); await chooseContinent(page, "Europe"); await shot("responsive-search-390");
  await resize(390,400); await search.focus(); await search.scrollIntoViewIfNeeded(); await reachable(search);
  await reachable(button("Clear search")); await button("Clear search").click();
  assert.equal(await search.evaluate(el => el === document.activeElement), true);
  await showView(page,"Map"); await showView(page,"Capitals");
  assert.equal(await search.inputValue(), ""); assert.equal(await continentValue(page), "Europe");
  await shell(); await shot("responsive-keyboard-390-400"); await chooseContinent(page, "");
  await resize(320,568); await button("Add capital").click(); await button("Create capital").click();
  assert.equal(await page.getByLabel("Capital name",{exact:true}).getAttribute("aria-invalid"), "true");
  await reachable(page.getByLabel("Capital name",{exact:true})); await shot("responsive-create-320");
  for (const [w,h] of [[568,320], [1440,900], [320,568]]) {
    await resize(w,h); await button("Cancel").scrollIntoViewIfNeeded(); await reachable(button("Cancel")); await reachable(button("Create capital"));
    assert.equal(await page.locator("dialog").evaluate(el => el.contains(document.activeElement)), true);
  }
  await page.keyboard.press("Escape"); await page.locator("dialog[open]").waitFor({state:"hidden"});
  await resize(390,844); await button("Add capital").click();
  for (const [name,value] of [["Capital name","QA city"],["Country name","QA country"],["Latitude","20"],["Longitude","30"]]) await page.getByLabel(name,{exact:true}).fill(value);
  await button("Create capital").click(); await page.locator("dialog[open]").waitFor({state:"hidden"});
  await reachable(page.locator(".mutation-notice"), false); // Intentionally pointer-events:none.
  assert.equal(await page.locator(".mutation-notice").evaluate(el => getComputedStyle(el).animationDuration), "0.08s"); await shot("responsive-toast-390");
  await page.waitForFunction(() => document.querySelector(".mutation-notice").textContent === "");
  await resize(320,568); const textStyle = await page.addStyleTag({content: ":root { font-size: 200%; }"});
  assert.equal(await page.locator(".app-header").evaluate(el => {
    el.scrollTop = 0;
    const topReachable = el.querySelector("h1").getBoundingClientRect().top >= el.getBoundingClientRect().top;
    el.scrollTop = el.scrollHeight;
    const bottomReachable = el.querySelector("p").getBoundingClientRect().bottom <= el.getBoundingClientRect().bottom;
    el.scrollTop = 0;
    return topReachable && bottomReachable;
  }), true, "large header text must remain scrollable from start to end");
  for (const locator of [search, button("Add capital"), button("Reset to default"), page.locator(".capital-list li").last().locator(".actions-trigger")]) {
    await locator.scrollIntoViewIfNeeded(); await reachable(locator);
  }
  for (const name of ["Map","Capitals"]) await reachable(page.getByRole("tab",{name,exact:true}));
  await shot("responsive-text200-capitals-320"); await page.locator(".capital-label").first().click(); await idle(); await bounds();
  await reachable(page.locator('.color-swatch[aria-pressed="true"]'));
  assert.ok(await page.locator(".capital-popup h2").evaluate(el => el.clientWidth) > 40, "text column collapsed");
  await shell(); await shot("responsive-text200-popup-320"); await textStyle.evaluate(el => el.remove());
  assert.equal(gets, 1); assert.equal(writes, 1); assert.deepEqual(errors, []);
  return { matrix, textScale: "200% root text", keyboardViewport: "390x400 emulation", gets, writes, errors };
}
