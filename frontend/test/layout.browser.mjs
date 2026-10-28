/* global document, innerWidth, innerHeight, getComputedStyle */
import assert from "node:assert/strict";
import { capitalAPI, capitals, button, field, focused, reachable, noOverflow, dialogClosed, fillCapital } from "./browser-helpers.mjs";
import { chooseContinent, continentValue } from "./continent-helpers.mjs";
import { showView } from "./view-helpers.mjs";

// Native menus, dialogs and responsive layout need a browser, not Mapbox.
export async function verifyLayout(page, baseURL) {
  const longName = "A very long capital name that wraps across several lines";
  const api = await capitalAPI(page, [...capitals, ...Array.from({ length: 25 }, (_, i) => ({ id: i + 10,
    name: i === 24 ? longName : `Capital ${i}`, country: `Country ${i}`, latitude: 0, longitude: i }))]);
  await page.goto(baseURL);
  await button(page, "Actions for Berlin").waitFor();
  const search = page.getByRole("searchbox"), combo = page.getByRole("combobox", { name: "Continent", exact: true });
  const menu = page.locator(".capital-actions-menu");
  await combo.focus(); await page.keyboard.press("Enter");
  assert.equal(await combo.getAttribute("aria-expanded"), "true");
  await page.keyboard.press("End"); await page.keyboard.press("Home"); await page.keyboard.press("ArrowUp");
  assert.equal(await page.getByRole("option", { name: "South America", exact: true }).getAttribute("id"), await combo.getAttribute("aria-activedescendant"));
  await page.keyboard.press("e");
  assert.equal(await page.getByRole("option", { name: "Europe", exact: true }).getAttribute("id"), await combo.getAttribute("aria-activedescendant"));
  assert.equal(await continentValue(page), "");
  await page.keyboard.press("Escape"); await focused(combo);
  await page.keyboard.press("Space"); await page.keyboard.press("e"); await page.keyboard.press("Enter");
  assert.equal(await continentValue(page), "Europe");
  await combo.click(); await page.keyboard.press("Tab"); await focused(button(page, "Add capital"));
  assert.equal(await page.getByRole("listbox").count(), 0);
  await search.fill("Tokyo");
  await button(page, "Clear search").click(); await focused(search);
  assert.equal(await continentValue(page), "Europe");
  await chooseContinent(page, "");

  // Menu edge placement is the only menu scenario repeated by viewport.
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height }); await showView(page, "Capitals");
    for (const name of ["Berlin", longName]) {
      const trigger = button(page, `Actions for ${name}`);
      await trigger.scrollIntoViewIfNeeded(); await trigger.focus();
      const before = await page.locator(".list-content").evaluate(el => el.scrollTop);
      await page.keyboard.press("Enter"); await focused(button(page, "Edit"));
      await reachable(button(page, "Edit")); await reachable(button(page, "Delete"));
      assert.equal(await page.locator(".list-content").evaluate(el => el.scrollTop), before);
      await page.keyboard.press("Tab"); await focused(button(page, "Delete"));
      await page.keyboard.press("Escape"); await focused(trigger);
    }
    await noOverflow(page);
  }
  await button(page, "Actions for Berlin").click();
  await page.locator(".list-content").evaluate(el => { el.scrollTop += 30; });
  await menu.waitFor({ state: "hidden" });
  await button(page, "Actions for Berlin").click();
  await page.setViewportSize({ width: 321, height: 568 }); await menu.waitFor({ state: "hidden" });
  await button(page, "Actions for Berlin").click(); await search.click(); await menu.waitFor({ state: "hidden" });
  await button(page, "Actions for Berlin").focus(); await page.keyboard.press("Space");
  await page.keyboard.press("Shift+Tab"); await focused(button(page, "Actions for Berlin"));
  assert.equal(await menu.count(), 0);

  await page.setViewportSize({ width: 1440, height: 900 });
  await showView(page, "Capitals");
  await page.locator(".list-content").evaluate(el => { el.scrollTop = 180; });
  const reads = api.reads;
  await button(page, "Collapse sidebar").click(); await focused(button(page, "Expand sidebar"));
  assert.equal(await page.getByRole("searchbox", { includeHidden: true }).evaluate(el => { el.focus(); return el === document.activeElement; }), false);
  await button(page, "Search capitals").focus(); await page.keyboard.press("Enter"); await focused(search);
  const panel = page.getByRole("dialog", { name: "Search capitals", exact: true });
  await search.fill("pRaGuE"); assert.equal(await panel.locator(".capital-label").count(), 1);
  await page.keyboard.press("Escape"); await focused(button(page, "Search capitals"));
  await button(page, "Search capitals").click(); assert.equal(await search.inputValue(), "pRaGuE");
  await page.locator(".map-panel").click({ position: { x: 100, y: 500 } });
  assert.equal(await panel.count(), 0);
  await button(page, "Search capitals").click(); await button(page, "Clear search").click();
  await panel.locator(".capital-label").last().focus(); await page.keyboard.press("Tab");
  assert.equal(await panel.count(), 0);
  await button(page, "Expand sidebar").click();
  await page.locator(".list-content").evaluate(el => { el.scrollTop = 180; });
  const scroll = await page.locator(".list-content").evaluate(el => el.scrollTop);
  assert.ok(scroll > 0);
  await button(page, "Collapse sidebar").click(); await button(page, "Expand sidebar").click();
  assert.equal(await page.locator(".list-content").evaluate(el => el.scrollTop), scroll);

  await page.getByRole("link", { name: "Skip to map" }).focus();
  await page.keyboard.press("Enter"); await focused(page.locator("#world-map"));

  // Native tab semantics and focus when crossing 700px both ways.
  await page.setViewportSize({ width: 700, height: 844 }); await showView(page, "Map");
  const tab = name => page.getByRole("tab", { name, exact: true });
  await tab("Map").focus(); await page.keyboard.press("ArrowRight"); await focused(tab("Capitals"));
  assert.equal(await tab("Capitals").getAttribute("aria-selected"), "true");
  await page.keyboard.press("Home"); await focused(tab("Map"));
  await page.keyboard.press("End"); await focused(tab("Capitals"));
  await search.fill("Berlin");
  await page.setViewportSize({ width: 701, height: 844 }); await showView(page, "Map");
  assert.equal(await page.evaluate(() => !!document.activeElement.closest("[hidden], .mobile-navigation")), false);
  await button(page, "Collapse sidebar").click();
  await page.setViewportSize({ width: 390, height: 844 }); await showView(page, "Capitals");
  assert.equal(await search.inputValue(), "Berlin");
  await page.setViewportSize({ width: 1440, height: 900 }); await showView(page, "Map");
  assert.equal(await search.isVisible(), false);
  await button(page, "Expand sidebar").click(); await button(page, "Clear search").click();

  // Compact/large-text cases check reachability, not CRUD a second time.
  for (const [width, height, large] of [[667, 375, false], [390, 320, false], [320, 568, true]]) {
    await page.setViewportSize({ width, height }); await showView(page, "Capitals");
    await page.evaluate(large => { document.documentElement.style.fontSize = large ? "200%" : ""; }, large);
    for (const locator of [search, combo, button(page, "Add capital"), button(page, "Reset to default")]) await reachable(locator);
    await combo.click(); await reachable(page.getByRole("listbox")); await page.keyboard.press("Escape");
    await button(page, "Add capital").click();
    await field(page, "Capital name").fill("Precise input"); await field(page, "Country name").fill("Country");
    await field(page, "Latitude").fill("91"); await field(page, "Longitude").fill("181");
    await button(page, "Create capital").click(); await focused(field(page, "Latitude"));
    assert.equal(await field(page, "Latitude").getAttribute("aria-describedby"), "latitude-range latitude-error");
    await field(page, "Latitude").fill("1"); await field(page, "Latitude").press("ArrowUp");
    assert.equal(await field(page, "Latitude").inputValue(), "2");
    await field(page, "Latitude").fill("12.12345678"); assert.equal(await field(page, "Latitude").inputValue(), "12.12345678");
    for (const locator of [field(page, "Capital name"), field(page, "Longitude"), button(page, "Create capital"), button(page, "Close dialog")]) await reachable(locator);
    await page.keyboard.press("Escape"); await dialogClosed(page);
    await button(page, "Reset to default").click(); await focused(button(page, "Cancel"));
    assert.equal(await page.locator("dialog li").count(), 3);
    for (const label of ["Cancel", "Reset capitals", "Close dialog"]) await reachable(button(page, label));
    await page.keyboard.press("Escape"); await dialogClosed(page);
    await noOverflow(page);
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.setViewportSize({ width: 390, height: 400 }); await showView(page, "Capitals");
  await search.fill("Berlin"); await reachable(search); await reachable(button(page, "Clear search"));
  await button(page, "Clear search").click(); await focused(search);
  assert.equal(api.writes.length, 0);

  // One real success notice for geometry, animation and safe-area behavior.
  await page.emulateMedia({ reducedMotion: "reduce" });
  await button(page, "Add capital").click();
  await fillCapital(page, { name: "Layout city", country: "Layout country", latitude: 0, longitude: 0 });
  await button(page, "Create capital").click(); await dialogClosed(page);
  const notice = page.locator(".mutation-notice");
  assert.equal(await notice.textContent(), "Capital created.");
  assert.equal(await notice.evaluate(el => getComputedStyle(el).animationDuration), "0.08s");
  const cdp = await page.context().newCDPSession(page);
  try {
    await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 34 } });
    assert.equal(await notice.evaluate(el => {
      const r = el.getBoundingClientRect(), nav = document.querySelector(".mobile-navigation").getBoundingClientRect();
      return Math.abs(r.left + r.width / 2 - innerWidth / 2) < 1 && Math.abs(nav.top - r.bottom - 24) < 1
        && r.top >= 0 && r.bottom <= innerHeight && getComputedStyle(el).pointerEvents === "none";
    }), true);
  } finally { await cdp.send("Emulation.setSafeAreaInsetsOverride", { insets: { bottom: 0 } }); await cdp.detach(); }
  assert.equal(api.reads, reads);
  return { keyboardMenus: true, rail: true, breakpoints: [700, 701], narrowAndLargeText: true };
}
