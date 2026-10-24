import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForDatabase } from "../src/db.js";

test("database readiness retries transient errors and stops when ready", async () => {
  let calls = 0;
  await waitForDatabase({ query: async (sql) => {
    assert.equal(sql, "select 1");
    if (++calls < 3) throw new Error("starting");
  } }, { attempts: 5, delayMs: 0 });
  assert.equal(calls, 3);
});

test("database readiness fails after a bounded number of attempts", async () => {
  let calls = 0;
  await assert.rejects(waitForDatabase({ query: async () => {
    calls++;
    throw new Error("unavailable");
  } }, { attempts: 3, delayMs: 0 }), /not ready after 3 attempts/);
  assert.equal(calls, 3);
});
