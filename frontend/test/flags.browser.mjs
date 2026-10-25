/* global document, innerWidth, getComputedStyle */
import assert from "node:assert/strict";
import { showView, viewButton } from "./view-helpers.mjs";

// A fresh isolated page, real Mapbox/CDN resources, fully mocked capital CRUD.
export async function verifyFlags(page, baseURL, screenshotDirectory) {
  const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, flagCode: "DE" };
  let records = [berlin,
    { ...berlin, id: 2, name: "Prague", country: "Czechia", latitude: 50.0755, longitude: 14.4378, flagCode: "CZ" },
    { ...berlin, id: 3, name: "Unknown city", country: "Unknown", flagCode: null },
    { ...berlin, id: 4, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35, flagCode: "FR" },
    { ...berlin, id: 5, name: "Invalid city", country: "Invalid", flagCode: "../de" },
    { ...berlin, id: 6, name: "Ambiguous city", country: "Ambiguous", flagCode: null }];
  const pageErrors = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  const cdn = [];
  let releaseGermany;
  const germanyGate = new Promise(resolve => { releaseGermany = resolve; });
  let releaseAntarctica;
  const antarcticaGate = new Promise(resolve => { releaseAntarctica = resolve; });
  await page.route("https://flags.restcountries.com/v5/svg/de.svg", async route => {
    await germanyGate;
    await route.continue();
  });
  await page.route("https://flags.restcountries.com/v5/svg/aq.svg", async route => {
    await antarcticaGate;
    await route.continue();
  });
  page.on("response", response => {
    if (/flags\.restcountries\.com\/v5\/svg\/(de|cz)\.svg$/.test(response.url())) cdn.push({ url: response.url(), status: response.status() });
  });
  await page.route("https://flags.restcountries.com/v5/svg/fr.svg", route => route.fulfill({ status: 404, body: "Controlled image failure" }));
  await page.route("**/capital{,/*}", route => {
    const request = route.request();
    if (request.method() === "GET") return route.fulfill({ json: records });
    const id = Number(request.url().split("/").pop());
    if (request.method() === "DELETE") {
      records = records.filter(record => record.id !== id);
      return route.fulfill({ status: 204 });
    }
    const input = request.postDataJSON();
    assert.deepEqual(Object.keys(input).sort(), ["country", "latitude", "longitude", "name"]);
    const saved = { ...input, id: request.method() === "POST" ? 20 : id,
      flagCode: input.country === "Germany" ? "DE" : input.country === "Czechia" ? "CZ" : input.country === "Antarctica" ? "AQ" : null };
    records = request.method() === "POST" ? [...records, saved] : records.map(record => record.id === id ? saved : record);
    return route.fulfill({ status: request.method() === "POST" ? 201 : 200, json: saved });
  });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  await page.locator(".capital-marker").first().waitFor();
  const button = name => viewButton(page, name);
  const row = (name, country) => button(`Show ${name}, ${country} on map`);
  const assertLoading = async locator => {
    await showView(page, await locator.evaluate(el => el.closest("#capital-sidebar") ? "Capitals" : "Map"));
    assert.equal(await locator.locator("img").evaluate(image => image.hidden && !image.complete), true);
    assert.equal(await locator.locator(".country-flag svg").isVisible(), true);
    assert.deepEqual(await locator.locator(".country-flag").evaluate(element => [element.offsetWidth, element.offsetHeight]), [40, 30]);
  };
  await assertLoading(row("Berlin", "Germany"));
  await showView(page, "Capitals"); await row("Berlin", "Germany").click();
  await assertLoading(page.locator(".capital-popup"));
  releaseGermany();
  const assertImage = async (locator, code) => {
    const image = locator.locator("img");
    await page.waitForFunction(image => image.complete && image.naturalWidth > 0 && !image.hidden, await image.elementHandle());
    assert.match(await image.getAttribute("src"), new RegExp(`/svg/${code}\\.svg$`));
    assert.equal(await image.evaluate(image => image.complete && image.naturalWidth > 0 && !image.hidden), true);
    assert.equal(await image.getAttribute("alt"), "");
    assert.equal(await locator.locator(".country-flag").getAttribute("aria-hidden"), "true");
  };
  const viewports = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await assertImage(row("Berlin", "Germany"), "de");
    await assertImage(row("Prague", "Czechia"), "cz");
    for (const [name, country] of [["Unknown city", "Unknown"], ["Invalid city", "Invalid"], ["Ambiguous city", "Ambiguous"]]) {
      assert.equal(await row(name, country).locator("img").count(), 0);
      assert.equal(await row(name, country).locator(".country-flag svg").count(), 1);
    }
    await showView(page, "Capitals"); await row("Berlin", "Germany").click();
    const popup = page.locator(".capital-popup");
    await assertImage(popup, "de");
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/flags-known-${width}.png` });
    await showView(page, "Map"); await button("Red marker").click();
    const marker = button("Berlin, Germany: change marker color");
    await page.keyboard.press("Escape");
    assert.equal(await marker.evaluate(element => element === document.activeElement), true);
    await showView(page, "Capitals"); await row("Paris", "France").click();
    await page.waitForFunction(() => {
      const image = document.querySelector(".capital-popup img");
      return image?.hidden && image.complete && image.naturalWidth === 0;
    });
    assert.equal(await popup.locator(".country-flag svg").isVisible(), true);
    assert.equal(await row("Paris", "France").locator("img").evaluate(image => image.hidden), true);
    const geometry = await page.evaluate(() => ({
      overflow: document.documentElement.scrollWidth > innerWidth,
      markers: [...document.querySelectorAll(".capital-marker")].every(element => element.offsetWidth === 32 && element.offsetHeight === 32 && getComputedStyle(element).borderRadius === "0px"),
      flags: [...document.querySelectorAll(".country-flag")].filter(el => !el.closest("[hidden]")).every(element => element.offsetWidth === 40 && element.offsetHeight === 30),
    }));
    assert.deepEqual(geometry, { overflow: false, markers: true, flags: true });
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/flags-${width}.png` });
    await page.keyboard.press("Escape");
    viewports.push({ width, ...geometry });
  }
  // Update the selected row through the real form/store and retain popup/color.
  await showView(page, "Capitals"); await row("Berlin", "Germany").click();
  await showView(page, "Capitals"); await button("Actions for Berlin").click();
  await button("Edit").click();
  await page.getByLabel("Country name", { exact: true }).fill("Antarctica");
  await button("Save changes").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  await assertLoading(row("Berlin", "Antarctica"));
  await assertLoading(page.locator(".capital-popup"));
  releaseAntarctica();
  await assertImage(row("Berlin", "Antarctica"), "aq");
  await assertImage(page.locator(".capital-popup"), "aq");
  // Czechia already loaded in the Prague row: also exercise decoded image reuse.
  await showView(page, "Capitals"); await button("Actions for Berlin").click();
  await button("Edit").click();
  await page.getByLabel("Country name", { exact: true }).fill("Czechia");
  await button("Save changes").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  await assertImage(row("Berlin", "Czechia"), "cz");
  await assertImage(page.locator(".capital-popup"), "cz");
  assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");
  assert.equal(await row("Berlin", "Czechia").getAttribute("aria-pressed"), "true");
  await page.keyboard.press("Escape");
  await showView(page, "Capitals"); await button("Add capital").click();
  for (const [label, value] of [["Capital name", "Manual city"], ["Country name", "Germany"], ["Latitude", "0"], ["Longitude", "0"]]) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  await button("Create capital").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  await assertImage(row("Manual city", "Germany"), "de");
  await showView(page, "Capitals"); await button("Actions for Manual city").click();
  await button("Delete").click();
  await button("Delete capital").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  assert.equal(await row("Manual city", "Germany").count(), 0);
  assert.deepEqual(pageErrors, []);
  assert.ok(cdn.some(response => response.url.endsWith("de.svg") && response.status === 200));
  assert.ok(cdn.some(response => response.url.endsWith("cz.svg") && response.status === 200));
  return { viewports, realCdn: cdn, loadingGlobe: true, imageFailureFallback: true, countryEditLoadingReset: true, countryEdit: true, manualCreateDelete: true, pageErrors };
}
