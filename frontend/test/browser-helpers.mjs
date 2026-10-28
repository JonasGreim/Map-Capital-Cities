/* global URL, structuredClone, document, innerWidth, innerHeight, getComputedStyle, requestAnimationFrame */
import assert from "node:assert/strict";

export const capitals = [
  { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] },
  { id: 2, name: "Prague", country: "Czechia", latitude: 50.0755, longitude: 14.4378, continents: ["Europe"] },
  { id: 3, name: "Tokyo", country: "Japan", latitude: 35.68, longitude: 139.69, continents: ["Asia"], population: 123000000, currencies: [{ code: "JPY", name: "Japanese yen" }] },
];
export const button = (page, name) => page.getByRole("button", { name, exact: true });
export const field = (page, name) => page.getByLabel(name, { exact: true });
export const row = (page, name, country) => button(page, `Show ${name}, ${country} on map`);
export const marker = (page, name, country) => page.locator(`.capital-marker[aria-label="${name}, ${country}: change marker color"]`);
export const dialogClosed = page => page.locator("dialog[open]").waitFor({ state: "hidden" });
export const focused = async locator => {
  await locator.page().waitForFunction(el => el === document.activeElement, await locator.elementHandle());
};
export async function fillCapital(page, { name, country, latitude, longitude }) {
  for (const [label, value] of [["Capital name", name], ["Country name", country], ["Latitude", latitude], ["Longitude", longitude]]) {
    await field(page, label).fill(String(value));
  }
}

// The API is a controlled HTTP fixture, not evidence of PostgreSQL persistence.
// Held routes return immediately and are released explicitly; closing the
// context cancels any remaining route without leaving a hanging handler promise.
export async function capitalAPI(page, defaults = capitals) {
  const api = { records: structuredClone(defaults), reads: 0, writes: [], readMode: "success", writeMode: "success", pending: [] };
  async function respond(route, mode) {
    const req = route.request(), method = req.method();
    if (mode === "network") return route.abort("failed");
    if (typeof mode === "number") return route.fulfill({ status: mode, json: { error: "private SQL details" } });
    if (method === "GET") return route.fulfill({ json: mode === "empty" ? [] : api.records });
    const path = new URL(req.url()).pathname;
    if (path === "/capital-reset") {
      assert.equal(method, "POST");
      assert.deepEqual(req.postDataJSON(), { confirm: true });
      api.records = structuredClone(defaults);
      if (mode === "lost") return route.abort("failed");
      return route.fulfill({ json: api.records });
    }
    const id = Number(path.split("/").at(-1));
    if (method === "DELETE") {
      assert.ok(api.records.some(c => c.id === id), "DELETE must address an existing capital");
      api.records = api.records.filter(c => c.id !== id);
      return route.fulfill({ status: 204 });
    }
    assert.ok(["POST", "PUT"].includes(method), `Unexpected capital method: ${method}`);
    if (method === "PUT") assert.ok(api.records.some(c => c.id === id), "PUT must address an existing capital");
    const input = req.postDataJSON();
    assert.deepEqual(Object.keys(input).sort(), ["country", "latitude", "longitude", "name"]);
    const metadata = defaults.find(c => c.country === input.country);
    const saved = { ...input, id: method === "POST" ? 100 : id, continents: metadata?.continents ?? null,
      population: metadata?.population ?? null, currencies: metadata?.currencies ?? null };
    api.records = api.records.filter(c => c.id !== saved.id).concat(saved);
    return route.fulfill({ status: method === "POST" ? 201 : 200, json: saved });
  }
  await page.route("**/capital{,-reset,/*}", route => {
    const req = route.request();
    if (req.method() === "GET") api.reads++;
    else api.writes.push({ method: req.method(), path: new URL(req.url()).pathname,
      input: req.method() === "DELETE" ? undefined : req.postDataJSON() });
    const mode = req.method() === "GET" ? api.readMode : api.writeMode;
    if (mode === "hold") { api.pending.push(route); return; }
    return respond(route, mode);
  });
  api.release = async (mode = "success") => {
    assert.equal(api.pending.length, 1, "Exactly one request must be pending");
    await respond(api.pending.shift(), mode);
  };
  return api;
}

export async function reachable(locator, hitTest = true) {
  await locator.scrollIntoViewIfNeeded();
  assert.equal(await locator.evaluate((el, hitTest) => {
    const r = el.getBoundingClientRect();
    if (r.width <= 0 || r.height <= 0 || r.left < -1 || r.right > innerWidth + 1 || r.top < -1 || r.bottom > innerHeight + 1) return false;
    for (let p = el.parentElement; p; p = p.parentElement) {
      const s = getComputedStyle(p), b = p.getBoundingClientRect();
      if (/(auto|scroll|hidden|clip)/.test(s.overflowY) && (r.top < b.top - 1 || r.bottom > b.bottom + 1)) return false;
      if (/(auto|scroll|hidden|clip)/.test(s.overflowX) && (r.left < b.left - 1 || r.right > b.right + 1)) return false;
    }
    return !hitTest || el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
  }, hitTest), true, `Control must be reachable: ${await locator.textContent()}`);
}
export async function noOverflow(page) {
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
}
export async function popupFits(page) {
  await page.waitForFunction(() => {
    const p = document.querySelector(".mapboxgl-popup"), m = document.getElementById("world-map");
    if (!p || !m) return false;
    const r = p.getBoundingClientRect(), b = m.getBoundingClientRect();
    return r.left >= b.left - 1 && r.right <= b.right + 1 && r.top >= b.top - 1 && r.bottom <= b.bottom + 1;
  });
  assert.equal(await page.locator(".capital-popup").evaluate(el => el.scrollWidth <= el.clientWidth), true);
  await reachable(button(page, "Close popup"));
}
// Observe stable rendered geometry, without access to a Mapbox instance or app
// internals. A bounded wait covers ResizeObserver, camera animation and inertia.
export async function mapSettled(page) {
  await page.locator(".capital-marker").first().waitFor({ state: "attached" });
  await page.evaluate(() => new Promise((resolve, reject) => {
    let previous, stable = 0, frames = 0;
    function sample() {
      const canvas = document.querySelector(".mapboxgl-canvas"), map = document.querySelector(".map");
      const current = [...document.querySelectorAll(".capital-marker:not([hidden])")].map(el => el.style.transform).join("|");
      stable = current === previous ? stable + 1 : 0;
      previous = current;
      if (stable >= 8 && canvas.clientWidth === map.clientWidth && canvas.clientHeight === map.clientHeight) return resolve();
      if (++frames > 1200) return reject(new Error("Rendered map did not settle"));
      requestAnimationFrame(sample);
    }
    requestAnimationFrame(sample);
  }));
}
export const positions = page => page.locator(".capital-marker").evaluateAll(els => els.map(el => el.style.transform));
export async function loseContext(page) {
  await page.locator(".mapboxgl-canvas").evaluate(canvas => {
    const extension = canvas.getContext("webgl2").getExtension("WEBGL_lose_context");
    if (!extension) throw new Error("WEBGL_lose_context unavailable");
    // Store only a browser WebGL extension for the matching restore operation.
    globalThis.browserContextLoss = extension;
    extension.loseContext();
  });
}
export async function restoreContext(page) {
  await page.evaluate(() => globalThis.browserContextLoss.restoreContext());
  await page.locator(".map-error").waitFor({ state: "hidden" });
}
