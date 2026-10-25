import assert from "node:assert/strict";
import { test } from "node:test";
import { waitForDatabase } from "../src/db.js";

test("database readiness retries transient errors and stops when ready", async () => {
  let calls = 0;
  await waitForDatabase({ query: async (sql) => {
    assert.equal(sql, "select 1");
    if (++calls < 3) throw Object.assign(new Error("starting"), { code: "ECONNREFUSED" });
  } }, { attempts: 5, delayMs: 0 });
  assert.equal(calls, 3);
});

test("database readiness fails after a bounded number of attempts", async () => {
  let calls = 0;
  await assert.rejects(waitForDatabase({ query: async () => {
    calls++;
    throw Object.assign(new Error("unavailable"), { code: "57P03" });
  } }, { attempts: 3, delayMs: 0 }), /not ready after 3 attempts/);
  assert.equal(calls, 3);
});

test("database readiness succeeds immediately for a ready database", async () => {
  let calls = 0;
  await waitForDatabase({ query: async () => { calls++; } });
  assert.equal(calls, 1);
});

test("known temporary connection errors and pg timeouts are retried", async () => {
  for (const failure of [
    ...["ECONNRESET", "ETIMEDOUT", "EPIPE", "EAI_AGAIN", "ENETUNREACH", "EHOSTUNREACH",
      "08000", "08001", "08003", "08006", "53300"].map(code => ({ code })),
    ...["Connection terminated due to connection timeout", "timeout exceeded when trying to connect",
      "Connection terminated unexpectedly", "Connection terminated", "Query read timeout"].map(message => new Error(message)),
  ]) {
    let calls = 0;
    await waitForDatabase({ query: async () => { if (++calls === 1) throw failure; } }, { delayMs: 0 });
    assert.equal(calls, 2);
  }
});

test("database configuration errors fail immediately with safe actionable messages", async () => {
  for (const [code, hint] of [
    ["28P01", "authentication failed"], ["28000", "authentication failed"],
    ["3D000", "database does not exist"], ["ENOTFOUND", "host not found"],
    ["secret-code", "unrecognized connection/configuration error"],
  ]) {
    let calls = 0;
    await assert.rejects(waitForDatabase({ query: async () => {
      calls++;
      throw Object.assign(new Error("postgres://private-user:private-password@private-host/private-db"), { code });
    } }, { delayMs: 0 }), error => {
      assert.ok(error instanceof Error);
      assert.ok(error.message.includes(hint));
      assert.ok(error.message.includes("DATABASE_URL"));
      assert.doesNotMatch(error.message, /private-|secret-code|postgres:\/\//);
      assert.equal(error.cause, undefined);
      return true;
    });
    assert.equal(calls, 1);
  }
});

test("unknown errors fail closed and exhausted retries omit raw connection details", async () => {
  for (const failure of [new Error("private-password"), null, "private-password", { code: "ECONNREFUSED", message: "private-password" }]) {
    await assert.rejects(waitForDatabase({ query: async () => { throw failure; } }, { attempts: 2, delayMs: 0 }), error => {
      assert.ok(error instanceof Error);
      assert.match(error.message, /PostgreSQL/);
      assert.doesNotMatch(error.message, /private-password/);
      return true;
    });
  }
});

test("default readiness budget allows more than ten temporary failures", async () => {
  let calls = 0;
  await waitForDatabase({ query: async () => {
    if (++calls <= 10) throw { code: "ECONNREFUSED" };
  } }, { delayMs: 0 });
  assert.equal(calls, 11);
});

test("invalid readiness budgets reject without querying", async () => {
  for (const options of [
    { attempts: 0 }, { attempts: -1 }, { attempts: 1.5 }, { attempts: Infinity }, { attempts: NaN },
    { delayMs: -1 }, { delayMs: 0.5 }, { delayMs: Infinity }, { delayMs: NaN }, { delayMs: 2_147_483_648 },
  ]) {
    await assert.rejects(waitForDatabase({ query: async () => assert.fail("must not query") }, options), /readiness requires/);
  }
});
