/* global process, console */
import { URL, fileURLToPath } from "node:url";
import { createServer } from "vite";
import { verifyMarkerColors } from "./marker-colors.browser.mjs";
import { verifyFlags } from "./flags.browser.mjs";
import { verifyMapSelection } from "./map-selection.browser.mjs";
import { verifySidebar } from "./sidebar.browser.mjs";
import { verifyContinents } from "./continents.browser.mjs";
import { verifyReset } from "./reset.browser.mjs";
import { verifySidebarPolish } from "./sidebar-polish.browser.mjs";
import { verifyBranding } from "./branding.browser.mjs";
import { verifyPopupActions } from "./popup-actions.browser.mjs";
import { verifyCoordinatePicker } from "./coordinate-picker.browser.mjs";
import { verifyMapErrors } from "./map-errors.browser.mjs";
import { verifyToast } from "./toast.browser.mjs";

// Reuse externally supplied Playwright tooling; no extra project dependency.
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ?? "playwright");
const server = await createServer({
  root: fileURLToPath(new URL("..", import.meta.url)),
  server: { host: "localhost", port: 5188, strictPort: true },
});
let browser;
try {
  if (!server.config.env.VITE_MAPBOX_TOKEN) throw new Error("Browser regressions require VITE_MAPBOX_TOKEN in the environment or root .env");
  await server.listen();
  browser = await chromium.launch({
    headless: true,
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE,
    args: ["--use-gl=angle", "--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
  });
  for (const [name, verify] of [["toast", verifyToast], ["coordinate-picker", verifyCoordinatePicker], ["marker-colors", verifyMarkerColors], ["branding", verifyBranding], ["flags", verifyFlags], ["selection", verifyMapSelection], ["sidebar", verifySidebar], ["reset", verifyReset], ["continents", verifyContinents], ["sidebar-polish", verifySidebarPolish], ["popup-actions", verifyPopupActions],
    ...["success", "construction-error", "initial-style-error"].map(mode => [`map-errors-${mode}`, (page, url) => verifyMapErrors(page, url, mode)])]) {
    const context = await browser.newContext({ hasTouch: name === "popup-actions" });
    try {
      console.log(name, JSON.stringify(await verify(await context.newPage(), "http://localhost:5188", ["toast", "coordinate-picker", "marker-colors", "sidebar-polish", "popup-actions"].includes(name) ? process.env.BROWSER_SCREENSHOT_DIR : undefined)));
    } finally { await context.close(); }
  }
} finally {
  try { await browser?.close(); }
  finally { await server.close(); }
}
