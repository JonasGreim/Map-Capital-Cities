import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { build, createServer, preview } from "vite";

test("Vite serves the branded document and public SVG in development and production", async () => {
  const root = fileURLToPath(new URL("..", import.meta.url));
  const favicon = await readFile(join(root, "public/favicon.svg"), "utf8");
  const outDir = await mkdtemp(join(tmpdir(), "capital-branding-"));
  const dev = await createServer({ root, logLevel: "silent", server: { host: "127.0.0.1", port: 0 } });
  let production: Awaited<ReturnType<typeof preview>> | undefined;
  try {
    await dev.listen();
    await build({ root, logLevel: "silent", build: { outDir, emptyOutDir: true } });
    assert.equal(await readFile(join(outDir, "favicon.svg"), "utf8"), favicon);
    production = await preview({ root, logLevel: "silent", build: { outDir }, preview: { host: "127.0.0.1", port: 0 } });
    for (const server of [dev.httpServer, production.httpServer]) {
      const address = server?.address();
      assert.ok(address && typeof address !== "string");
      const base = `http://127.0.0.1:${address.port}`;
      const html = await (await fetch(base)).text();
      assert.match(html, /<title>Map Capital Cities<\/title>/);
      assert.match(html, /<link rel="icon" type="image\/svg\+xml" href="\/favicon.svg"\s*\/>/);
      const response = await fetch(`${base}/favicon.svg`);
      assert.equal(response.status, 200);
      assert.match(response.headers.get("content-type") ?? "", /image\/svg\+xml/);
      assert.equal(await response.text(), favicon);
    }
  } finally {
    await dev.close();
    const httpServer = production?.httpServer;
    if (httpServer) await new Promise<void>((resolve, reject) => httpServer.close(error => error ? reject(error) : resolve()));
    await rm(outDir, { recursive: true, force: true });
  }
});
