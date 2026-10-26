/* global process, console, document */
import { URL, fileURLToPath } from "node:url";
import { createServer } from "vite";
import { verifyMarkerColors } from "./marker-colors.browser.mjs";
import { verifyFlags } from "./flags.browser.mjs";
import { verifyMapSelection } from "./map-selection.browser.mjs";
import { verifySidebarControls } from "./sidebar-controls.browser.mjs";
import { verifySidebarRail } from "./sidebar-rail.browser.mjs";
import { verifySidebar } from "./sidebar.browser.mjs";
import { verifyContinents } from "./continents.browser.mjs";
import { verifyReset } from "./reset.browser.mjs";
import { verifySidebarPolish } from "./sidebar-polish.browser.mjs";
import { verifyBranding } from "./branding.browser.mjs";
import { verifyPopupActions } from "./popup-actions.browser.mjs";
import { verifyCoordinatePicker } from "./coordinate-picker.browser.mjs";
import { verifyMapErrors } from "./map-errors.browser.mjs";
import { verifyMobileResponsive } from "./mobile-responsive.browser.mjs";
import { verifyMobileNavigation } from "./mobile-navigation.browser.mjs";
import { verifyToast } from "./toast.browser.mjs";
import { verifyMapNavigation } from "./map-navigation.browser.mjs";

// Reuse externally supplied Playwright tooling; no extra project dependency.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { host: "localhost", port: 5188, strictPort: true },
});
let browser;
const failures = [];
try {
  if (!server.config.env.VITE_MAPBOX_TOKEN) throw new Error("Browser regressions require VITE_MAPBOX_TOKEN in the environment or root .env");
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  for (const [name, verify] of [["map-navigation", verifyMapNavigation], ["sidebar-controls", verifySidebarControls], ["sidebar-rail", verifySidebarRail], ["mobile-responsive", verifyMobileResponsive], ["mobile-navigation", verifyMobileNavigation], ["toast", verifyToast], ["coordinate-picker", verifyCoordinatePicker], ["marker-colors", verifyMarkerColors], ["branding", verifyBranding], ["flags", verifyFlags], ["selection", verifyMapSelection], ["sidebar", verifySidebar], ["reset", verifyReset], ["continents", verifyContinents], ["sidebar-polish", verifySidebarPolish], ["popup-actions", verifyPopupActions],
    ...["success", "construction-error", "initial-style-error", "no-token"].map(mode => [`map-errors-${mode}`, (page, url) => verifyMapErrors(page, url, mode)])]) {
    if (process.env.BROWSER_SUITES && !process.env.BROWSER_SUITES.split(",").includes(name)) continue;
    const context = await browser.newContext({ hasTouch: ["popup-actions", "sidebar-controls"].includes(name) });
    try {
      console.log(name, JSON.stringify(await verify(await context.newPage(), "http://localhost:5188", ["map-navigation", "sidebar-controls", "sidebar-rail", "reset", "mobile-responsive", "mobile-navigation", "toast", "coordinate-picker", "marker-colors", "sidebar-polish", "popup-actions"].includes(name) ? process.env.BROWSER_SCREENSHOT_DIR : undefined)));
    } catch (error) {
      if (process.env.BROWSER_SCREENSHOT_DIR) {
        const page = context.pages()[0];
        await page?.screenshot({ path: `${process.env.BROWSER_SCREENSHOT_DIR}/failure-${name}.png` });
        console.log("failure state", await page?.evaluate(() => ({focus: document.activeElement?.outerHTML.slice(0,200), dialog: document.querySelector("dialog")?.open, hidden: document.getElementById("world-map")?.hidden})));
      }
      console.error(name, error);
      failures.push(error);
    } finally { await context.close(); }
  }
  if (failures.length) throw new AggregateError(failures, "Browser suites failed");
} finally {
  try { await browser?.close(); }
  finally { await server.close(); }
}
