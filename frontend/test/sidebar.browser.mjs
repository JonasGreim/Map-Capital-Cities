/* global document, getComputedStyle, structuredClone, innerWidth */
import assert from "node:assert/strict";

// Reusable with an isolated Playwright Page. All capital traffic is intercepted;
// no backend or development database is used. No Playwright dependency is added.
export async function verifySidebar(page, baseURL) {
  const fixtures = [
    { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 },
    { id: 2, name: "Prague", country: "Czechia", latitude: 50.0755, longitude: 14.4378 },
    ...Array.from({ length: 20 }, (_, i) => ({ id: i + 3, name: `Capital ${i + 3}`, country: `Country ${i + 3}`, latitude: i, longitude: i * 3 })),
    { id: 23, name: "A very long capital name that wraps across several lines", country: "A very long country name that wraps across several lines", latitude: -10, longitude: -20 },
  ];
  let records = structuredClone(fixtures);
  let readMode = "success";
  let releaseRead;
  let releaseWrite;
  let writeMode = "success";
  const writes = [];
  const errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/capital{,/*}", async route => {
    const request = route.request();
    const method = request.method();
    if (method === "GET") {
      if (readMode === "hold") await new Promise(resolve => { releaseRead = resolve; });
      return route.fulfill(readMode === "error" ? { status: 503, json: {} } : { json: readMode === "empty" ? [] : records });
    }
    writes.push(method);
    if (writeMode === "hold") await new Promise(resolve => { releaseWrite = resolve; });
    if (writeMode === "error") return route.fulfill({ status: 409, json: {} });
    const id = Number(request.url().split("/").pop());
    if (method === "DELETE") {
      records = records.filter(record => record.id !== id);
      return route.fulfill({ status: 204 });
    }
    const saved = { ...request.postDataJSON(), id: method === "POST" ? 100 : id };
    records = records.filter(record => record.id !== saved.id).concat(saved);
    return route.fulfill({ status: method === "POST" ? 201 : 200, json: saved });
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const reloadData = async () => {
    await page.getByRole("region", { name: "Capital results" }).focus();
    await page.evaluate(async () => {
      const { useCapitalStore } = await import("/src/capital-store.ts");
      void useCapitalStore.getState().fetchCapitals();
    });
  };
  const focused = async locator => { await page.waitForFunction(el => el === document.activeElement, await locator.elementHandle(), { timeout: 3000 }); };
  const search = page.getByRole("searchbox", { name: "Search countries or capitals" });
  const evidence = [];
  await page.goto(baseURL);
  await button("Actions for Berlin").waitFor();
  await page.locator(".mapboxgl-canvas").waitFor();
  await page.locator(".mapboxgl-canvas").evaluate(el => { el.dataset.sidebarTest = "original"; });
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 900 });
    await search.fill("  gErMaNy  ");
    assert.equal(await page.locator(".capital-list li").count(), 1);
    assert.equal(await page.locator("#search-results-count").textContent(), "1 of 23 capitals");
    assert.equal(await page.locator(".capital-marker").count(), 23);
    await search.fill("pRaGuE");
    assert.equal(await page.locator(".capital-list li").count(), 1);
    await search.fill("no such place");
    await page.getByText("No matching capitals. Try another search or continent.").waitFor();
    assert.equal(await page.locator("#search-results-count").textContent(), "0 of 23 capitals");
    await button("Collapse sidebar").click();
    assert.equal(await page.locator("#capital-sidebar").isVisible(), false);
    await page.waitForFunction(() => {
      const map = document.querySelector(".map");
      const canvas = document.querySelector(".mapboxgl-canvas");
      return map.clientHeight >= 320 && Math.abs(map.clientWidth - canvas.clientWidth) <= 1 && Math.abs(map.clientHeight - canvas.clientHeight) <= 1;
    });
    await focused(button("Expand sidebar"));
    await page.keyboard.press("Shift+Tab");
    assert.equal(await page.evaluate(() => !!document.activeElement.closest("#capital-sidebar")), false);
    await button("Expand sidebar").click();
    assert.equal(await search.inputValue(), "no such place");
    await search.fill("");
    await button("Actions for Berlin").focus();
    await page.keyboard.press("Enter");
    await focused(button("Edit"));
    await page.keyboard.press("Tab");
    await focused(button("Delete"));
    await page.keyboard.press("Escape");
    await focused(button("Actions for Berlin"));
    await button("Actions for Berlin").click();
    await button("Actions for Berlin").click();
    assert.equal(await button("Edit").count(), 0);
    await page.keyboard.press("Space");
    await page.keyboard.press("Shift+Tab");
    await focused(button("Actions for Berlin"));
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    await page.keyboard.press("Tab");
    assert.equal(await button("Edit").count(), 0);
    await button("Actions for Berlin").click();
    await page.locator(".capital-name").filter({ hasText: /^Berlin$/ }).click({ position: { x: 4, y: 4 } });
    assert.equal(await button("Edit").count(), 0);
    await button("Actions for Berlin").click();
    await page.getByRole("heading", { name: "Countries & capitals" }).click();
    assert.equal(await button("Edit").count(), 0);
    await button("Actions for Berlin").click();
    await button("Edit").click();
    await page.getByRole("dialog", { name: "Edit capital" }).waitFor();
    assert.equal(await page.getByLabel("Capital name", { exact: true }).inputValue(), "Berlin");
    await page.keyboard.press("Escape");
    await focused(button("Actions for Berlin"));
    await button("Add capital").click();
    await focused(page.getByLabel("Capital name", { exact: true }));
    await page.keyboard.press("Shift+Tab");
    // Native dialogs may hand boundary focus to browser chrome; background stays inert.
    assert.equal(await page.evaluate(() => !!document.activeElement.closest(".map-panel, .list-actions, .list-search")), false);
    await page.keyboard.press("Tab");
    await focused(page.getByLabel("Capital name", { exact: true }));
    await button("Cancel").click();
    await focused(button("Add capital"));
    const skip = page.getByRole("link", { name: "Skip to map" });
    assert.equal(await skip.evaluate(el => getComputedStyle(el).clipPath), "inset(50%)");
    await skip.focus();
    assert.equal(await skip.evaluate(el => getComputedStyle(el).clipPath), "none");
    await page.keyboard.press("Enter");
    await focused(page.getByRole("region", { name: "World map", exact: true }));
    await page.waitForFunction(() => {
      const map = document.querySelector(".map");
      const canvas = document.querySelector(".mapboxgl-canvas");
      return Math.abs(map.clientWidth - canvas.clientWidth) <= 1 && Math.abs(map.clientHeight - canvas.clientHeight) <= 1;
    });
    assert.equal(await page.locator(".mapboxgl-canvas").getAttribute("data-sidebar-test"), "original");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    assert.equal(await page.locator(".capital-marker").first().evaluate(el => el.offsetWidth === 32 && el.offsetHeight === 32 && getComputedStyle(el).borderRadius === "0px"), true);
    evidence.push({ width, search: true, menus: true, dialogs: true, keyboard: true, mapCanvasPreserved: true, overflow: false });
  }
  // Real browser writes use the controlled route above, including pending/error states.
  await button("Add capital").click();
  await button("Create capital").click();
  await focused(page.getByLabel("Capital name", { exact: true }));
  for (const [label, value] of [["Capital name", "Test City"], ["Country name", "Test Country"], ["Latitude", "10"], ["Longitude", "20"]]) {
    await page.getByLabel(label, { exact: true }).fill(value);
  }
  writeMode = "hold";
  await button("Create capital").click();
  await page.getByText("Saving capital…", { exact: true }).waitFor();
  assert.equal(await button("Cancel").isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog.capital-dialog").isVisible(), true);
  releaseWrite();
  writeMode = "success";
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  await focused(button("Add capital"));
  assert.equal(await page.locator(".capital-marker").count(), 24);
  await search.fill("Test City");
  await button("Actions for Test City").click();
  await button("Edit").click();
  await page.getByLabel("Capital name", { exact: true }).fill("Renamed City");
  writeMode = "error";
  await button("Save changes").click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.getByLabel("Capital name", { exact: true }).inputValue(), "Renamed City");
  writeMode = "success";
  await button("Save changes").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  await focused(button("Add capital")); // edited record no longer matches search
  await search.fill("Renamed City");
  await button("Actions for Renamed City").click();
  await button("Delete").click();
  await button("Cancel").click();
  await focused(button("Actions for Renamed City"));
  await button("Actions for Renamed City").click();
  await button("Delete").click();
  await button("Delete capital").click();
  await page.locator("dialog.capital-dialog").waitFor({ state: "hidden" });
  await focused(button("Add capital"));
  assert.deepEqual(writes, ["POST", "PUT", "PUT", "DELETE"]);
  assert.equal(await page.locator(".capital-marker").count(), 23);
  await search.fill("");
  readMode = "hold";
  await reloadData();
  await page.getByText("Loading capitals…", { exact: true }).waitFor();
  assert.equal(await button("Add capital").isDisabled(), true);
  readMode = "error";
  releaseRead();
  await button("Try again").waitFor();
  await button("Try again").focus();
  readMode = "success";
  await page.keyboard.press("Enter");
  await button("Actions for Berlin").waitFor();
  await focused(page.getByRole("region", { name: "Capital results" }));
  readMode = "empty";
  await reloadData();
  await page.getByText("No capitals available yet.").waitFor();
  readMode = "success";
  await reloadData();
  await button("Actions for Berlin").waitFor();
  assert.equal(await page.locator(".mapboxgl-canvas").getAttribute("data-sidebar-test"), "original");
  assert.deepEqual(errors, []);
  return { viewports: evidence, mockedCRUD: writes, loadingErrorRetryEmpty: true, pageErrors: errors };
}
