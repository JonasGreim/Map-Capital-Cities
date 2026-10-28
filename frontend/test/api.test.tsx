import assert from "node:assert/strict";
import { test } from "node:test";
import { getCapitals } from "../src/api";

const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };

test("API requests the plain capital array with native fetch", async (t) => {
  const signal = new AbortController().signal;
  const timeoutMock = t.mock.method(AbortSignal, "timeout", () => signal);
  const fetchMock = t.mock.method(globalThis, "fetch", async () => Response.json([berlin]));
  assert.deepEqual(await getCapitals(), [berlin]);
  assert.deepEqual(timeoutMock.mock.calls[0].arguments, [120_000]);
  assert.deepEqual(fetchMock.mock.calls[0].arguments, ["/capital", { headers: { Accept: "application/json" }, signal }]);
});

test("API accepts an empty array", async (t) => {
  t.mock.method(globalThis, "fetch", async () => Response.json([]));
  assert.deepEqual(await getCapitals(), []);
});

test("API reports HTTP errors without displaying server internals", async (t) => {
  t.mock.method(globalThis, "fetch", async () => new Response("private database details", { status: 500 }));
  await assert.rejects(getCapitals(), { message: "Unable to load capitals (HTTP 500). Please try again." });
});

test("API reports network failures", async (t) => {
  t.mock.method(globalThis, "fetch", async () => { throw new TypeError("Failed to fetch"); });
  await assert.rejects(getCapitals(), /Could not reach the capital API/);
});

test("API times out while reading a response body with a safe message", async (t) => {
  const controller = new AbortController();
  t.mock.method(AbortSignal, "timeout", () => controller.signal);
  const response = Response.json([berlin]);
  t.mock.method(response, "json", () => new Promise((_resolve, reject) => {
    controller.signal.addEventListener("abort", () => reject(controller.signal.reason), { once: true });
    controller.abort(new DOMException("Internal timeout details", "TimeoutError"));
  }));
  t.mock.method(globalThis, "fetch", async () => response);
  await assert.rejects(getCapitals(), { message: "The capital API took too long to respond. Please try again." });
});

test("API rejects malformed JSON and incompatible response shapes", async (t) => {
  for (const body of ["not JSON", "null", "{}", JSON.stringify({ data: [berlin] }), "[null]",
    JSON.stringify([{ ...berlin, country: "" }]), JSON.stringify([{ ...berlin, latitude: 91 }]), JSON.stringify([{ ...berlin, latitude: "52.52" }])]) {
    const fetchMock = t.mock.method(globalThis, "fetch", async () => new Response(body));
    await assert.rejects(getCapitals(), /invalid response/);
    fetchMock.mock.restore();
  }
});
