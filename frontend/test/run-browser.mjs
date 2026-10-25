/* global process, console */
import { URL, fileURLToPath } from "node:url";
import { createServer } from "vite";
import { verifyFlags } from "./flags.browser.mjs";
import { verifyMapSelection } from "./map-selection.browser.mjs";
import { verifySidebar } from "./sidebar.browser.mjs";

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
  for (const [name, verify] of [["flags", verifyFlags], ["selection", verifyMapSelection], ["sidebar", verifySidebar]]) {
    const context = await browser.newContext();
    try {
      console.log(name, JSON.stringify(await verify(await context.newPage(), "http://localhost:5188")));
    } finally { await context.close(); }
  }
} finally {
  try { await browser?.close(); }
  finally { await server.close(); }
}
