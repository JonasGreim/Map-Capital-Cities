/* global process, console, document, window, fetch, URL */
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { build, preview } from "vite";
import { showView } from "./view-helpers.mjs";

// Opt-in destructive smoke against a disposable LOCAL database/API only.
// Unlike the existing UI fixtures, capital HTTP/SQL and CORS are real here.
const api = new URL(process.env.TEST_API_URL ?? "http://invalid");
if (api.protocol !== "http:" || !["localhost", "127.0.0.1"].includes(api.hostname)) {
  throw new Error("Set TEST_API_URL to an isolated loopback API; this smoke performs CRUD and reset");
}
const apiURL = api.origin, webURL = "http://localhost:5190";
assert.notEqual(apiURL, webURL, "Production smoke requires two different origins");
assert.equal((await fetch(`${apiURL}/health`)).status, 200);
const { chromium } = await import("playwright");
const scratch = await mkdtemp(join(tmpdir(), "capital-deployment-"));
const root = fileURLToPath(new URL("..", import.meta.url));
let browser, server;
try {
  const config = await build({ root, logLevel: "silent", build: { outDir: join(scratch, "dist"), emptyOutDir: true },
    define: { "import.meta.env.VITE_API_BASE_URL": JSON.stringify(apiURL) } });
  assert.ok(config);
  server = await preview({ root, logLevel: "silent", build: { outDir: join(scratch, "dist") },
    preview: { host: "localhost", port: 5190, strictPort: true } });
  browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  for (const width of [1440, 390, 320]) {
    const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
    try {
      const page = await context.newPage(), errors = [], requests = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => {
        if (new URL(request.url()).pathname.startsWith("/capital")) requests.push(request.url());
      });
      let gate = width === 390 ? "hold" : width === 320 ? "fail" : "none", held;
      await page.route(`${apiURL}/capital`, route => {
        if (route.request().method() === "GET" && gate !== "none") {
          const action = gate; gate = "none";
          if (action === "hold") { held = route; return; }
          return route.abort("failed");
        }
        return route.continue();
      });
      if (width === 390) await page.clock.install();
      await page.goto(webURL, { waitUntil: "domcontentloaded" });
      if (width === 390) {
        await page.locator(".capital-loading-spinner").waitFor();
        await page.clock.fastForward(5_100);
        await page.getByText(/This demo uses free hosting/).waitFor();
        await held.continue(); // Continue to the REAL API, with native browser CORS.
      } else if (width === 320) {
        await page.locator(".capital-load-error").getByRole("alert").waitFor();
        await page.getByRole("button", { name: "Try again" }).click();
      }
      await showView(page, "Capitals");
      const berlin = page.getByRole("button", { name: "Show Berlin, Germany on map", exact: true });
      await berlin.waitFor();
      assert.equal(await page.locator(".capital-load-error").count(), 0);
      assert.equal(await page.locator(".capital-loading-status").textContent(), "");
      await berlin.click();
      const popup = page.locator(".mapboxgl-popup");
      await popup.getByText("Country population", { exact: true }).waitFor();
      assert.match(await popup.textContent(), /EUR/);
      await page.waitForFunction(() => {
        const image = document.querySelector(".mapboxgl-popup .country-flag img");
        return image?.complete && image.naturalWidth > 0;
      });
      assert.ok(await page.locator(".capital-marker").count() > 200);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
      if (process.env.BROWSER_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.BROWSER_SCREENSHOT_DIR}/production-${width}.png` });
      await popup.locator(".mapboxgl-popup-close-button").click();
      await showView(page, "Capitals");
      const name = `Deployment smoke ${width}`;
      await page.locator("#add-capital").click();
      for (const [label, value] of [["Capital name", name], ["Country name", name], ["Latitude", "10"], ["Longitude", "20"]]) {
        await page.getByLabel(label, { exact: true }).fill(value);
      }
      const write = (method, path) => page.waitForResponse(r => r.url() === `${apiURL}${path}` && r.request().method() === method);
      const creating = write("POST", "/capital");
      await page.getByRole("button", { name: "Create capital", exact: true }).click();
      const created = await creating;
      assert.equal(created.status(), 201);
      assert.equal(created.headers()["access-control-allow-origin"], webURL);
      const { id } = await created.json();
      assert.equal((await fetch(`${apiURL}/capital/${encodeURIComponent(name.toUpperCase())}`)).status, 200);
      await page.getByRole("button", { name: `Actions for ${name}`, exact: true }).click();
      await page.getByRole("button", { name: "Edit", exact: true }).click();
      await page.getByLabel("Capital name", { exact: true }).fill(`${name} edited`);
      const updating = write("PUT", `/capital/${id}`);
      await page.getByRole("button", { name: "Save changes", exact: true }).click();
      assert.equal((await updating).status(), 200);
      await page.getByRole("button", { name: `Actions for ${name} edited`, exact: true }).click();
      await page.getByRole("button", { name: "Delete", exact: true }).click();
      const deleting = write("DELETE", `/capital/${id}`);
      await page.getByRole("button", { name: "Delete capital", exact: true }).click();
      assert.equal((await deleting).status(), 204);
      await page.getByRole("button", { name: `Actions for ${name} edited`, exact: true }).waitFor({ state: "detached" });
      if (width === 320) {
        await page.locator("#reset-capitals").click();
        const resetting = write("POST", "/capital-reset");
        await page.getByRole("button", { name: "Reset capitals", exact: true }).click();
        assert.equal((await resetting).status(), 200);
        await berlin.waitFor();
      }
      assert.ok(requests.length > 0 && requests.every(url => new URL(url).origin === apiURL));
      assert.deepEqual(errors, []);
      console.log(JSON.stringify({ width, realCrossOriginCrud: true, flagsAndFacts: true, mapbox: true,
        delayedRead: width === 390, networkErrorAndRetry: width === 320, reset: width === 320, pageErrors: errors }));
    } finally { await context.close(); }
  }
} finally {
  try { await browser?.close(); }
  finally { try { await server?.close(); } finally { await rm(scratch, { recursive: true, force: true }); } }
}
