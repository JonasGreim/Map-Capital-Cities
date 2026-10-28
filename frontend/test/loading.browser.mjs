/* global getComputedStyle */
import assert from "node:assert/strict";
import { capitalAPI, button, row, focused, noOverflow } from "./browser-helpers.mjs";
import { showView } from "./view-helpers.mjs";

export async function verifyLoading(page, baseURL) {
  const api = await capitalAPI(page);
  await page.clock.install();
  api.readMode = "hold";
  await page.setViewportSize({ width: 320, height: 568 });
  await page.goto(baseURL, { waitUntil: "domcontentloaded" });
  const status = page.locator(".capital-loading-status"), spinner = page.locator(".capital-loading-spinner");
  const slow = page.getByText(/This demo uses free hosting/);
  await spinner.waitFor();
  assert.equal(await page.getByText("No capitals available yet.", { exact: true }).count(), 0);
  assert.equal(await status.getAttribute("aria-live"), "polite");
  assert.equal(await status.evaluate(el => !!el.closest('[hidden], [aria-busy="true"]')), false);
  const layout = () => page.locator(".app-header, .layout, .mobile-navigation").evaluateAll(els => els.map(el => {
    const r = el.getBoundingClientRect(); return [r.x, r.y, r.width, r.height];
  }));
  const initialLayout = await layout();
  await page.clock.fastForward(4000); assert.equal(await slow.count(), 0);
  await page.clock.fastForward(1100); await slow.waitFor();
  assert.deepEqual(await layout(), initialLayout);
  await page.emulateMedia({ reducedMotion: "reduce" });
  assert.equal(await spinner.evaluate(el => getComputedStyle(el).animationName), "none");
  await noOverflow(page);
  await api.release();
  await spinner.waitFor({ state: "detached" });
  await page.clock.fastForward(6000);
  assert.equal(await status.textContent(), "");
  await showView(page, "Capitals"); await row(page, "Berlin", "Germany").waitFor();
  assert.equal(api.reads, 1);

  // Both hidden-list branches expose one actionable error, with native keyboard
  // retry. The transport error matrix/deadline belongs to API units.
  for (const width of [390, 1440]) {
    await page.setViewportSize({ width, height: 844 });
    api.readMode = 503;
    await page.goto(baseURL);
    if (width > 700) await button(page, "Collapse sidebar").click();
    const fallback = page.locator(".capital-load-error");
    await fallback.getByRole("alert").waitFor();
    assert.equal(await page.getByRole("alert").count(), 1);
    const reads = api.reads;
    await page.clock.fastForward(6000); assert.equal(api.reads, reads);
    await showView(page, "Capitals");
    if (width > 700) await button(page, "Expand sidebar").click();
    assert.equal(await fallback.count(), 0);
    assert.equal(await button(page, "Try again").count(), 1);
    await showView(page, "Map");
    if (width > 700) await button(page, "Collapse sidebar").click();
    api.readMode = "hold";
    await button(page, "Try again").focus(); await focused(button(page, "Try again")); await page.keyboard.press("Enter");
    await spinner.waitFor();
    assert.equal(await page.getByRole("alert").count(), 0);
    assert.equal(await slow.count(), 0, "retry gets a fresh explanation timer");
    await api.release(); await spinner.waitFor({ state: "detached" });
    await showView(page, "Capitals");
    if (width > 700) await button(page, "Expand sidebar").click();
    await row(page, "Berlin", "Germany").waitFor();
    assert.equal(api.reads, reads + 1);
    await page.clock.fastForward(6000); assert.equal(await slow.count(), 0);
  }
  api.readMode = "empty";
  await page.goto(baseURL);
  await page.getByText("No capitals available yet.", { exact: true }).waitFor();
  assert.equal(await spinner.count(), 0);
  assert.equal(api.writes.length, 0);
  return { slowSuccess: true, hiddenListRetry: [390, 1440], emptySuccess: true };
}
