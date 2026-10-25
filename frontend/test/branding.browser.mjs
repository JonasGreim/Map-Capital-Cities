/* global document, DOMParser, getComputedStyle, Image, fetch, URL */
import assert from "node:assert/strict";
import { showView, viewButton } from "./view-helpers.mjs";

// Runs against both Vite dev and production preview without a database.
export async function verifyBranding(page, baseURL, screenshotDirectory) {
  const writes = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/capital{,-reset,/*}", route => {
    if (route.request().method() !== "GET") writes.push(route.request().method());
    return route.fulfill({ json: [{ id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 }] });
  });
  const brand = page.getByRole("link", { name: "Map Capital Cities – Home", exact: true });
  const globe = brand.locator("svg");
  const search = page.getByRole("searchbox", { includeHidden: true });
  const title = async () => assert.equal(await page.title(), "Map Capital Cities");
  const transform = () => globe.evaluate(el => getComputedStyle(el).transform);
  const geometry = () => page.locator(".app-header h1, .app-header p, .layout, .brand-link").evaluateAll(elements =>
    elements.map(el => { const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height]; }));
  await page.goto(baseURL);
  await search.waitFor();
  await title();
  assert.equal(await brand.getAttribute("href"), "/");
  assert.equal(await globe.getAttribute("aria-hidden"), "true");
  assert.equal(await brand.locator("button, input, select, a").count(), 0);
  const icon = page.locator('link[rel="icon"]');
  assert.equal(await icon.getAttribute("type"), "image/svg+xml");
  assert.equal(await icon.getAttribute("href"), "/favicon.svg");
  assert.deepEqual(await page.evaluate(async () => {
    const response = await fetch(document.querySelector('link[rel="icon"]').href);
    const svg = new DOMParser().parseFromString(await response.text(), "image/svg+xml");
    const image = new Image();
    image.src = response.url;
    await image.decode();
    return { status: response.status, type: response.headers.get("content-type").split(";")[0],
      valid: !svg.querySelector("parsererror") && svg.documentElement.namespaceURI === "http://www.w3.org/2000/svg", decoded: image.naturalWidth > 0 };
  }), { status: 200, type: "image/svg+xml", valid: true, decoded: true });

  const evidence = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    await page.setViewportSize({ width, height });
    await page.emulateMedia({ reducedMotion: "no-preference" });
    await page.mouse.move(width - 1, height - 1);
    await brand.evaluate(el => el.blur());
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".brand-globe")).transform === "none");
    const before = await geometry();
    assert.equal(await brand.evaluate(el => el.getBoundingClientRect().height >= 44), true);
    await brand.hover();
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".brand-globe")).transform === "matrix(1.06, 0, 0, 1.06, 0, 0)");
    assert.equal(await globe.evaluate(el => getComputedStyle(el).transitionDuration), "0.2s");
    assert.deepEqual(await geometry(), before, "hover must not move header text or layout");
    await page.mouse.move(width - 1, height - 1);
    // Start at the document to prove natural Tab reachability, not just focus().
    await page.evaluate(() => { document.activeElement?.blur(); document.body.tabIndex = -1; document.body.focus(); document.body.removeAttribute("tabindex"); });
    await page.keyboard.press("Tab");
    assert.equal(await brand.evaluate(el => el === document.activeElement && el.matches(":focus-visible")), true);
    assert.deepEqual(await brand.evaluate(el => { const s = getComputedStyle(el); return [s.outlineStyle, s.outlineWidth, s.outlineColor]; }), ["solid", "3px", "rgb(188, 94, 18)"]);
    await page.waitForFunction(() => getComputedStyle(document.querySelector(".brand-globe")).transform === "matrix(1.06, 0, 0, 1.06, 0, 0)");
    assert.deepEqual(await geometry(), before, "focus must not move layout");
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/branding-focus-${width}.png` });
    await page.emulateMedia({ reducedMotion: "reduce" });
    assert.equal(await transform(), "none");
    await brand.hover();
    assert.equal(await transform(), "none");
    assert.equal(await globe.evaluate(el => getComputedStyle(el).transitionDuration), "0s");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), true);
    evidence.push({ width, height, hover: true, keyboardFocus: true, reducedMotion: true, overflow: false });

    await showView(page, "Capitals"); await search.fill("no matching capital");
    await viewButton(page, "Collapse sidebar").click();
    await brand.focus();
    await Promise.all([page.waitForEvent("load"), page.keyboard.press("Enter")]);
    await showView(page, "Capitals"); await search.waitFor();
    assert.equal(new URL(page.url()).pathname, "/");
    assert.equal(await search.inputValue(), "");
    await viewButton(page, "Collapse sidebar").waitFor();
    await title();
    await showView(page, "Capitals"); await search.fill("Berlin");
    await Promise.all([page.waitForEvent("load"), globe.click()]);
    await showView(page, "Capitals"); await search.waitFor();
    assert.equal(await search.inputValue(), "");
    await title();
    await page.reload();
    await showView(page, "Capitals"); await search.waitFor();
    await title();
  }
  assert.deepEqual(writes, [], "home navigation must never write capital data");
  assert.deepEqual(errors, []);
  return evidence;
}
