import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import type { AddressInfo } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build, createServer, preview } from "vite";

const root = fileURLToPath(new URL("..", import.meta.url));

async function checkBranding(server: { address: () => AddressInfo | string | null }, favicon: string) {
  const address = server.address();
  assert.ok(address && typeof address !== "string");
  const base = `http://127.0.0.1:${address.port}`;
  const document = await fetch(base, { signal: AbortSignal.timeout(5000) });
  assert.equal(document.status, 200);
  const html = await document.text();
  assert.match(html, /<title>Map Capital Cities<\/title>/);
  assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon.svg"\s*\/>/);
  const response = await fetch(`${base}/favicon.svg`, { signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /image\/svg\+xml/);
  assert.equal(await response.text(), favicon);
}

test("Vite dev serves the branded document and public SVG", { timeout: 30_000 }, async () => {
  console.info("[branding:dev] create server with an empty temporary cache");
  const listeners = process.listenerCount("SIGTERM");
  const scratch = await mkdtemp(join(tmpdir(), "capital-branding-dev-"));
  let dev: Awaited<ReturnType<typeof createServer>> | undefined;
  try {
    dev = await createServer({ root, cacheDir: join(scratch, "cache"), logLevel: "silent",
      // React's config hook adds optimizer entries; clear them after config
      // resolution so this HTML/SVG test starts no background JS optimizer.
      plugins: [{ name: "branding-http-only", configResolved(config) {
        config.optimizeDeps.noDiscovery = true;
        config.optimizeDeps.include = [];
      } }],
      // This HTTP test reads HTML/SVG only. Speculative JS transforms can wait
      // on the cold dependency optimizer while close() waits on those transforms.
      server: { host: "127.0.0.1", port: 0, preTransformRequests: false } });
    await dev.listen();
    console.info("[branding:dev] check document and favicon over HTTP");
    await checkBranding(dev.httpServer!, await readFile(join(root, "public/favicon.svg"), "utf8"));
  } finally {
    console.info("[branding:dev] close server");
    try { await dev?.close(); }
    finally { await rm(scratch, { recursive: true, force: true }); }
    if (dev) assert.equal(dev.httpServer?.listening, false);
    assert.equal(process.listenerCount("SIGTERM"), listeners);
    console.info("[branding:dev] cleanup complete");
  }
});

// Top-level tests run sequentially. The dev server is fully closed before build
// or preview starts, including when a request/assertion fails.
test("Vite production preview serves the branded document and public SVG", { timeout: 90_000 }, async () => {
  console.info("[branding:production] build into a temporary directory");
  const listeners = process.listenerCount("SIGTERM");
  const scratch = await mkdtemp(join(tmpdir(), "capital-branding-production-"));
  const outDir = join(scratch, "dist");
  let production: Awaited<ReturnType<typeof preview>> | undefined;
  try {
    const favicon = await readFile(join(root, "public/favicon.svg"), "utf8");
    await build({ root, logLevel: "silent", build: { outDir, emptyOutDir: true } });
    assert.equal(await readFile(join(outDir, "favicon.svg"), "utf8"), favicon);
    console.info("[branding:production] start preview");
    production = await preview({ root, logLevel: "silent", build: { outDir }, preview: { host: "127.0.0.1", port: 0 } });
    console.info("[branding:production] check document and favicon over HTTP");
    await checkBranding(production.httpServer, favicon);
  } finally {
    console.info("[branding:production] close preview");
    // Vite's close() also removes its process listener and destroys sockets;
    // closing just httpServer bypasses that lifecycle.
    try { await production?.close(); }
    finally { await rm(scratch, { recursive: true, force: true }); }
    if (production) assert.equal(production.httpServer.listening, false);
    assert.equal(process.listenerCount("SIGTERM"), listeners);
    console.info("[branding:production] cleanup complete");
  }
});
