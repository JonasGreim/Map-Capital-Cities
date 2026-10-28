/* global process, console, URL, setTimeout, clearTimeout */
import assert from "node:assert/strict";
import { fileURLToPath } from "node:url";
import { performance } from "node:perf_hooks";
import { chromium } from "playwright";
import { createServer } from "vite";
import { verifySmoke } from "./smoke.browser.mjs";
import { verifyLoading } from "./loading.browser.mjs";
import { verifyLayout } from "./layout.browser.mjs";
import { verifyBranding } from "./branding.browser.mjs";
import { verifyMap } from "./map.browser.mjs";
import { verifyCoordinatePicker } from "./coordinate-picker.browser.mjs";
import { verifyFlags } from "./flags.browser.mjs";
import { verifyMapErrors } from "./map-errors.browser.mjs";

const mode = process.argv[2];
assert.ok(["--smoke", "--full"].includes(mode), "Use --smoke or --full");
const suites = [
  { name: "smoke", verify: verifySmoke, smoke: true },
  { name: "loading", verify: verifyLoading, smoke: true },
  { name: "layout", verify: verifyLayout },
  { name: "branding", verify: verifyBranding },
  { name: "map", verify: verifyMap, mapbox: true },
  { name: "coordinate-picker", verify: verifyCoordinatePicker, mapbox: true },
  { name: "flags", verify: verifyFlags, mapbox: true },
  ...["construction", "style"].map(error => ({ name: `map-errors-${error}`, mapbox: true,
    verify: (page, url) => verifyMapErrors(page, url, error) })),
];
const requested = process.env.BROWSER_SUITES?.split(",");
if (requested) for (const name of requested) assert.ok(suites.some(s => s.name === name && (mode === "--full" || s.smoke)), `Unknown suite for ${mode}: ${name}`);
const selected = suites.filter(s => (mode === "--full" || s.smoke) && (!requested || requested.includes(s.name)));
const root = fileURLToPath(new URL("..", import.meta.url));
const baseURL = "http://localhost:5188";
let server, browser, context;
const failures = [];
const deadline = setTimeout(() => { console.error("Browser runner exceeded its 8-minute deadline"); process.exit(1); }, 480_000);
async function cleanup() {
  try { await browser?.close(); }
  finally { await server?.close(); }
}
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => {
  void cleanup().finally(() => process.exit(1));
});
try {
  browser = await chromium.launch({ headless: true, timeout: 30_000,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
  console.log(`Browser ${browser.version()}, mode ${mode}`);
  for (const mapbox of [false, true]) {
    const group = selected.filter(s => !!s.mapbox === mapbox);
    if (!group.length) continue;
    // Override at Vite configuration level. Smoke never inherits a private token
    // or an external API URL from the root .env; app sources stay unmodified.
    server = await createServer({ root, logLevel: "error",
      define: { ...(!mapbox && { "import.meta.env.VITE_MAPBOX_TOKEN": '""' }), "import.meta.env.VITE_API_BASE_URL": '""' },
      server: { host: "localhost", port: 5188, strictPort: true } });
    try {
      if (mapbox && !server.config.env.VITE_MAPBOX_TOKEN) throw new Error("Full map suites require VITE_MAPBOX_TOKEN in the environment or root .env");
      await server.listen();
      for (const suite of group) {
        console.log(`${suite.name} START`);
        const start = performance.now(), errors = [], external = [];
        context = await browser.newContext({ viewport: { width: 1440, height: 900 }, hasTouch: true });
        const page = await context.newPage();
        page.setDefaultTimeout(15_000); page.setDefaultNavigationTimeout(30_000);
        page.on("pageerror", error => errors.push(error.message));
        if (!mapbox) await context.route("**/*", route => {
          if (new URL(route.request().url()).origin === baseURL) return route.continue();
          external.push(new URL(route.request().url()).origin);
          return route.abort("blockedbyclient");
        });
        let timeout;
        try {
          const result = await Promise.race([
            suite.verify(page, baseURL, process.env.BROWSER_SCREENSHOT_DIR),
            new Promise((_, reject) => { timeout = setTimeout(() => reject(new Error(`${suite.name} exceeded ${mapbox ? 120 : 60}s`)), mapbox ? 120_000 : 60_000); }),
          ]);
          assert.deepEqual(errors, [], "No uncaught browser errors");
          assert.deepEqual(external, [], "Token-free suites must not request external services");
          console.log(`${suite.name} PASS ${((performance.now() - start) / 1000).toFixed(1)}s`, JSON.stringify(result));
        } catch (error) {
          // Do not log token-bearing request URLs, HARs or served bundles.
          console.error(`${suite.name} FAIL`, error);
          failures.push(error);
          if (process.env.BROWSER_SCREENSHOT_DIR) await page.screenshot({ path: `${process.env.BROWSER_SCREENSHOT_DIR}/failure-${suite.name}.png`, timeout: 5000 }).catch(() => {});
        } finally { clearTimeout(timeout); await context.close(); context = undefined; }
      }
    } finally { await server.close(); server = undefined; }
  }
  if (failures.length) throw new AggregateError(failures, "Browser suites failed");
} finally {
  try { await cleanup(); } finally { clearTimeout(deadline); }
}
