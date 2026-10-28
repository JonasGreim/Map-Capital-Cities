/* global document, getComputedStyle */
import assert from "node:assert/strict";
import { capitalAPI, button, field, row, fillCapital, focused, dialogClosed } from "./browser-helpers.mjs";
import { showView } from "./view-helpers.mjs";

// Central React/native-dialog flow, deliberately without a Mapbox token.
export async function verifySmoke(page, baseURL) {
  const api = await capitalAPI(page);
  await page.clock.install();
  await page.goto(baseURL);
  await page.getByText("Map unavailable.", { exact: false }).waitFor();
  assert.equal(await page.locator("canvas, .map-navigation").count(), 0);
  await row(page, "Berlin", "Germany").waitFor();
  const search = page.getByRole("searchbox");
  await search.fill("  gErMaNy  ");
  assert.deepEqual(await page.locator(".capital-name").allTextContents(), ["Berlin"]);
  assert.equal(await page.locator("#search-results-count").textContent(), "1 of 3 capitals");
  await search.fill("not a capital");
  await page.getByText("No matching capitals. Try another search or continent.", { exact: true }).waitFor();
  await button(page, "Clear search").click(); await focused(search);
  await row(page, "Berlin", "Germany").click(); await focused(page.locator("#world-map"));

  await button(page, "Add capital").focus(); await page.keyboard.press("Enter");
  await focused(field(page, "Capital name"));
  assert.equal(await button(page, "Select on map").isDisabled(), true);
  await page.getByText("Map picking is unavailable. Enter coordinates manually.").waitFor();
  await page.keyboard.press("Shift+Tab"); await focused(button(page, "Close dialog"));
  await page.keyboard.press("Tab"); await focused(field(page, "Capital name"));
  await button(page, "Create capital").click(); await focused(field(page, "Capital name"));
  assert.equal(await field(page, "Capital name").getAttribute("aria-invalid"), "true");
  assert.equal(api.writes.length, 0);
  const input = { name: "Manual city", country: "Manual country", latitude: 0, longitude: -180 };
  await fillCapital(page, input);
  api.writeMode = "hold";
  await button(page, "Create capital").click();
  await page.getByText("Saving capital…", { exact: true }).waitFor();
  assert.equal(await button(page, "Cancel").isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 1);
  assert.equal(await page.locator(".mutation-notice").textContent(), "");
  await api.release(); api.writeMode = "success";
  await dialogClosed(page); await focused(button(page, "Add capital"));
  await row(page, input.name, input.country).waitFor();
  assert.deepEqual(api.writes, [{ method: "POST", path: "/capital", input }]);
  const notice = page.locator(".mutation-notice"), noticeNode = await notice.elementHandle();
  assert.equal(await notice.textContent(), "Capital created.");
  assert.equal(await notice.getAttribute("aria-live"), "polite");
  assert.equal(await notice.getAttribute("aria-atomic"), "true");
  await page.clock.fastForward(2500);

  await button(page, "Actions for Manual city").click(); await button(page, "Edit").click();
  assert.equal(await notice.textContent(), "");
  await field(page, "Capital name").fill("Renamed city");
  api.writeMode = 409;
  await button(page, "Save changes").click();
  const alert = page.locator("dialog").getByRole("alert");
  await alert.waitFor(); await focused(alert);
  await page.clock.fastForward(200);
  assert.equal(await alert.isVisible(), true);
  assert.equal(await field(page, "Capital name").inputValue(), "Renamed city");
  assert.equal(await row(page, input.name, input.country).count(), 1);
  assert.equal(await notice.textContent(), "");
  api.writeMode = "success";
  await button(page, "Save changes").click(); await dialogClosed(page);
  await focused(button(page, "Actions for Renamed city"));
  await row(page, "Renamed city", input.country).waitFor();
  assert.equal(await notice.textContent(), "Capital updated.");
  await page.clock.fastForward(2500); // Cross the old create deadline, before the new update deadline.
  assert.equal(await notice.textContent(), "Capital updated.");
  await page.clock.fastForward(600);
  assert.equal(await notice.textContent(), "");
  assert.equal(await noticeNode.evaluate(el => el === document.querySelector(".mutation-notice")), true);

  await button(page, "Actions for Renamed city").click(); await button(page, "Delete").click();
  await button(page, "Cancel").click(); await dialogClosed(page);
  await focused(button(page, "Actions for Renamed city"));
  assert.equal(api.writes.length, 3);
  await button(page, "Actions for Renamed city").click(); await button(page, "Delete").click();
  await button(page, "Delete capital").click(); await dialogClosed(page);
  await focused(button(page, "Add capital"));
  assert.equal(await row(page, "Renamed city", input.country).count(), 0);
  assert.equal(await notice.textContent(), "Capital deleted.");
  assert.deepEqual(api.writes.map(w => [w.method, w.path]), [["POST", "/capital"], ["PUT", "/capital/100"], ["PUT", "/capital/100"], ["DELETE", "/capital/100"]]);

  await button(page, "Reset to default").click(); await focused(button(page, "Cancel"));
  await page.keyboard.press("Escape"); await focused(button(page, "Reset to default"));
  assert.equal(api.writes.length, 4);
  api.writeMode = "hold";
  await button(page, "Reset to default").click();
  await button(page, "Reset capitals").evaluate(el => { el.click(); el.click(); });
  await page.getByText("Resetting capitals…", { exact: true }).waitFor();
  assert.equal(await button(page, "Close dialog").isDisabled(), true);
  await page.keyboard.press("Escape");
  assert.equal(await page.locator("dialog[open]").count(), 1);
  assert.equal(api.writes.length, 5);
  await api.release(500);
  await alert.waitFor(); await focused(alert);
  assert.doesNotMatch(await alert.textContent(), /private SQL/);
  await page.clock.fastForward(5000);
  assert.equal(await alert.isVisible(), true, "Failures must not expire like success notices");
  await button(page, "Cancel").click();

  // An uncertain committed reset must recover with a GET, never a second POST.
  api.writeMode = "lost";
  await button(page, "Reset to default").click(); await button(page, "Reset capitals").click();
  await alert.filter({ hasText: "may have completed" }).waitFor();
  const writes = api.writes.length, reads = api.reads;
  api.readMode = 503;
  await button(page, "Reload current data").click();
  await page.getByRole("alert").filter({ hasText: "Unable to load capitals" }).first().waitFor();
  await button(page, "Cancel").click(); await focused(button(page, "Try again"));
  api.readMode = "success";
  await button(page, "Try again").click(); await row(page, "Berlin", "Germany").waitFor();
  assert.equal(api.writes.length, writes); assert.equal(api.reads, reads + 2);
  api.writeMode = "success";
  await button(page, "Reset to default").click(); await button(page, "Reset capitals").click();
  await dialogClosed(page);
  assert.equal(await notice.textContent(), "Default capitals restored. Marker colors reset to Teal.");
  assert.equal(await page.locator(".capital-label").count(), 3);
  assert.equal(await notice.evaluate(el => getComputedStyle(el).pointerEvents), "none");

  // The same no-token selection fallback also works through mobile navigation.
  await page.setViewportSize({ width: 390, height: 844 }); await showView(page, "Capitals");
  await row(page, "Berlin", "Germany").click(); await focused(page.locator("#world-map"));
  assert.equal(await page.getByRole("tab", { name: "Map", exact: true }).getAttribute("aria-selected"), "true");
  return { manualCRUD: true, pendingAndErrors: true, resetReadRecovery: true, noMapbox: true };
}
