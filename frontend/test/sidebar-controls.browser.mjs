/* global window, document, innerWidth, innerHeight, getComputedStyle */
import assert from "node:assert/strict";
import { chooseContinent, continentValue } from "./continent-helpers.mjs";
import { showView } from "./view-helpers.mjs";

// Every capital request is mocked; the real map runs in an isolated context.
export async function verifySidebarControls(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(15000);
  const names = ["Africa", "Antarctica", "Asia", "Europe", "North America", "Oceania", "South America"];
  const records = names.map((continent, index) => ({ id: index + 1, name: `Capital ${continent}`, country: `Country ${continent}`, latitude: index * 10, longitude: index * 20, continents: [continent] }));
  let reads = 0, writes = 0;
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/capital{,-reset,/*}", route => {
    if (route.request().method() === "GET") reads++; else writes++;
    return route.fulfill({ json: records });
  });
  const combo = page.getByRole("combobox", { name: "Continent", exact: true });
  const button = name => page.getByRole("button", { name, exact: true });
  const focused = async locator => page.waitForFunction(el => el === document.activeElement, await locator.elementHandle());
  const options = page.getByRole("option");
  const search = page.getByRole("searchbox", { name: "Search countries or capitals", exact: true });
  const shot = async name => { if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/controls-${name}.png` }); };
  const evidence = [];
  for (const [width, height] of [[1440, 900], [1024, 768], [701, 700], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.goto(baseURL);
    await page.locator(".capital-marker").last().waitFor();
    await showView(page, "Capitals");
    const initialReads = reads;
    await page.evaluate(() => { window.controlsCanvas = document.querySelector("canvas"); window.controlsMarkers = [...document.querySelectorAll(".capital-marker")]; });
    await shot(`${width}-closed`);
    await combo.focus(); await page.keyboard.press("Enter");
    await focused(combo);
    assert.equal(await combo.getAttribute("aria-expanded"), "true");
    assert.equal(await options.count(), 8);
    assert.equal(await options.locator("svg").count(), 8);
    assert.deepEqual(await options.allTextContents(), ["All continents✓", ...names]);
    assert.equal((await combo.ariaSnapshot()).includes('combobox "Continent"'), true);
    await page.keyboard.press("End");
    assert.equal(await combo.getAttribute("aria-activedescendant"), "continent-option-7");
    await page.keyboard.press("Home"); await page.keyboard.press("ArrowUp");
    assert.equal(await combo.getAttribute("aria-activedescendant"), "continent-option-7");
    await page.keyboard.press("ArrowDown");
    assert.equal(await combo.getAttribute("aria-activedescendant"), "continent-option-0");
    await page.keyboard.press("e");
    assert.equal(await combo.getAttribute("aria-activedescendant"), "continent-option-4");
    assert.equal(await continentValue(page), ""); // browsing doesn't filter until committed
    await page.keyboard.press("Escape"); await focused(combo);
    assert.equal(await page.getByRole("listbox").count(), 0);
    await page.keyboard.press("a");
    assert.equal(await combo.getAttribute("aria-activedescendant"), "continent-option-1");
    await page.keyboard.press("Escape");
    await page.keyboard.press("Space"); await page.keyboard.press("Home");
    for (let i = 0; i < 4; i++) await page.keyboard.press("ArrowDown");
    await page.keyboard.press("Enter"); await focused(combo);
    assert.equal(await continentValue(page), "Europe");
    await combo.click();
    assert.equal(await page.getByRole("option", { selected: true }).textContent(), "Europe✓");
    await shot(`${width}-dropdown`);
    await page.keyboard.press("Tab"); await focused(button("Add capital"));
    assert.equal(await page.getByRole("listbox").count(), 0);
    await combo.click(); await search.click();
    assert.equal(await page.getByRole("listbox").count(), 0);
    await focused(search);
    await search.fill("Asia");
    assert.equal(await page.locator("#capital-sidebar .capital-label").count(), 0);
    assert.equal(await page.locator(".capital-marker:not([hidden])").count(), 1);
    await button("Clear search").click(); await focused(search);
    assert.equal(await search.inputValue(), "");
    for (const value of [...names, ""]) {
      await chooseContinent(page, value);
      assert.equal(await continentValue(page), value);
      assert.equal(await page.locator("#capital-sidebar .capital-label").count(), value ? 1 : 7);
      assert.equal(await page.locator(".capital-marker:not([hidden])").count(), value ? 1 : 7);
      assert.equal(await combo.locator("svg.continent-icon").count(), 1);
    }
    if (width <= 700) {
      await combo.tap(); await page.getByRole("option", { name: "Asia", exact: true }).tap();
      assert.equal(await continentValue(page), "Asia");
      await chooseContinent(page, "");
    }
    await button("Add capital").focus(); await page.keyboard.press("Enter");
    await page.getByRole("dialog", { name: "Add a New Capital City", exact: true }).waitFor();
    await page.keyboard.press("Escape"); await focused(button("Add capital"));
    const reset = button("Reset to default");
    assert.equal(await reset.getAttribute("title"), "Reset to default");
    assert.equal(await reset.textContent(), "");
    await reset.focus(); await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor();
    assert.equal(writes, 0); // trigger never bypasses confirmation
    await page.keyboard.press("Escape"); await focused(reset);
    const geometry = await page.locator(".list-actions").evaluate(el => {
      const [add, reset] = [...el.querySelectorAll("button")].map(button => button.getBoundingClientRect());
      return add.width > reset.width && add.top === reset.top && reset.width === reset.height && reset.width >= 44;
    });
    assert.equal(geometry, true);
    await search.fill("Europe"); await chooseContinent(page, "Europe");
    if (width > 700) {
      await combo.click(); await button("Collapse sidebar").click();
      assert.equal(await page.getByRole("listbox").count(), 0);
      await shot(`${width}-collapsed`);
      await button("Expand sidebar").click();
    } else {
      await combo.click(); await showView(page, "Map");
      assert.equal(await page.getByRole("listbox").count(), 0);
      await showView(page, "Capitals");
    }
    assert.equal(await search.inputValue(), "Europe");
    assert.equal(await continentValue(page), "Europe");
    assert.equal(reads, initialReads);
    assert.equal(await page.evaluate(() => window.controlsCanvas === document.querySelector("canvas") && window.controlsMarkers.every((el, i) => el === document.querySelectorAll(".capital-marker")[i])), true);
    // Enlarged text, including short mobile: scroll the sidebar to reveal controls.
    await page.evaluate(() => { document.documentElement.style.fontSize = "200%"; });
    await combo.scrollIntoViewIfNeeded(); await combo.click();
    assert.equal(await page.getByRole("listbox").evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight; }), true);
    await page.getByRole("option", { name: "South America", exact: true }).click();
    await focused(combo);
    assert.equal(await combo.evaluate(el => el.clientHeight < 150 && el.scrollWidth <= el.clientWidth), true);
    await page.keyboard.press("Tab"); await page.keyboard.press("Shift+Tab"); await focused(combo);
    assert.equal(await combo.evaluate(el => getComputedStyle(el).outlineStyle), "solid");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await shot(`${width}-large-text`);
    await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
    evidence.push({ width, height, allOptions: true, keyboard: true, dismissal: true, dialogs: true, retainedState: true, largeText: true });
  }
  assert.deepEqual(errors, []);
  assert.equal(writes, 0);
  return { evidence, reads, writes, pageErrors: errors };
}
