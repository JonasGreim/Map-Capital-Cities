import assert from "node:assert/strict";
import { test } from "node:test";
import { apiUrl } from "../src/api-url";
import { createCapital, updateCapital, deleteCapital, resetCapitals } from "../src/api";

test("API base URL preserves relative development paths and all deployed endpoint paths", () => {
  for (const path of ["/capital", "/capital/42", "/capital-reset"]) {
    for (const base of [undefined, "", "  "]) assert.equal(apiUrl(path, base), path);
    for (const base of ["https://api.example", " https://api.example/// "]) {
      assert.equal(apiUrl(path, base), `https://api.example${path}`);
    }
  }
});

test("explicit write/reset rate-limit responses explain how to recover without automatic retry", async t => {
  const fetcher = t.mock.method(globalThis, "fetch", async () => new Response(null, { status: 429 }));
  const input = { name: "Demo", country: "Demo", latitude: 0, longitude: 0 };
  for (const operation of [() => createCapital(input), () => updateCapital(1, input), () => deleteCapital(1), resetCapitals]) {
    await assert.rejects(operation(), /Please wait a minute/);
  }
  assert.equal(fetcher.mock.callCount(), 4);
});
