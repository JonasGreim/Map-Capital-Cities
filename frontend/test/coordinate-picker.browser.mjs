import { chooseContinent, continentValue } from "./continent-helpers.mjs";
/* global document, window, requestAnimationFrame, innerWidth, innerHeight */
import assert from "node:assert/strict";
import { showView, viewButton } from "./view-helpers.mjs";

// Real Mapbox and native dialogs. Every API read/write stays in this fixture;
// instrumentation is applied only to Vite responses, never production code.
export async function verifyCoordinatePicker(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(20_000);
  const defaults = [
    { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405, continents: ["Europe"] },
    { id: 2, name: "Prague", country: "Czechia", latitude: 50.07, longitude: 14.43, continents: ["Europe"] },
  ];
  let records = defaults.map(record => ({ ...record }));
  let failure = false;
  let noToken = false;
  const writes = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  page.on("console", message => {
    if (message.type() === "error" && !/the server responded with a status of 409/.test(message.text())) errors.push(message.text());
  });
  await page.route("**/capital{,-reset,/*}", route => {
    const request = route.request(), method = request.method();
    if (method === "GET") return route.fulfill({ json: records });
    assert.ok(["POST", "PUT"].includes(method), "Unexpected CRUD/reset during picking");
    const input = request.postDataJSON();
    writes.push({ method, input });
    if (failure) return route.fulfill({ status: 409, json: {} });
    const saved = { ...input, id: method === "POST" ? 3 : Number(request.url().split("/").pop()) };
    records = [...records.filter(record => record.id !== saved.id), saved];
    return route.fulfill({ status: method === "POST" ? 201 : 200, json: saved });
  });
  await page.route("**/src/main.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    const root = 'createRoot(document.getElementById("root"))';
    assert.ok(source.includes(root));
    await route.fulfill({ response, body: source.replace(root, `(window.pickerRoot = ${root})`) });
  });
  function inspectMap(map, api) {
    window.pickerMap = map;
    const clickListeners = new Set();
    window.pickerClickListeners = clickListeners;
    const on = map.on.bind(map), off = map.off.bind(map);
    // Mapbox markers also own click listeners; count only the app's picker.
    map.on = (type, listener, ...rest) => { if (type === "click" && listener.name === "click") clickListeners.add(listener); return on(type, listener, ...rest); };
    map.off = (type, listener, ...rest) => { if (type === "click" && listener.name === "click") clickListeners.delete(listener); return off(type, listener, ...rest); };
    window.pickerMarkers = new Set();
    if (!api.Marker.prototype.pickerInspected) {
      api.Marker.prototype.pickerInspected = true;
      const add = api.Marker.prototype.addTo;
      api.Marker.prototype.addTo = function (...args) { window.pickerMarkers.add(this); return add.apply(this, args); };
    }
  }
  await page.route("**/src/Map.tsx", async route => {
    const response = await route.fetch();
    let source = await response.text();
    source = source.replace("const visible =", `const [inactive, setInactive] = useState(false);
      window.pickerSetInactive = setInactive;
      active = active && !inactive;
      const visible =`);
    if (noToken) source = source.replace(/const token =[^;]+;/, "const token = undefined;");
    // Vite may rename the default import, so obtain its identifier from source.
    const api = source.match(/import\s+(\w+)\s+from\s+["'][^"']*mapbox-gl[^"']*["']/)?.[1];
    assert.ok(api && source.includes("const failed ="));
    await route.fulfill({ response, body: source.replace("const failed =", `(${inspectMap.toString()})(map, ${api});\nconst failed =`) });
  });
  await page.route("**/src/coordinate-picker.ts", async route => {
    const response = await route.fetch(), source = await response.text();
    assert.ok(source.includes("onPick(coordinates);"));
    await route.fulfill({ response, body: source.replace("onPick(coordinates);", `
      window.pickerHandoff = { cursor: canvas.style.cursor, computed: getComputedStyle(canvas).cursor, listeners: window.pickerClickListeners.size };
      onPick(coordinates);`) });
  });
  const button = name => viewButton(page, name);
  const dialog = () => page.locator("dialog.capital-dialog");
  const field = name => page.getByLabel(name, { exact: true });
  const focused = async locator => {
    await page.waitForFunction(el => el === document.activeElement, await locator.elementHandle());
    assert.equal(await locator.evaluate(el => el === document.activeElement), true);
  };
  const frame = () => page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const value = async () => ({ latitude: await field("Latitude").inputValue(), longitude: await field("Longitude").inputValue() });
  async function idle() {
    await page.waitForFunction(() => window.pickerMap && !window.pickerMap.isMoving());
  }
  async function start() {
    await page.waitForFunction(() => !document.getElementById("pick-on-map")?.disabled);
    await button("Select on map").focus();
    await page.keyboard.press("Enter");
    await page.locator(".coordinate-pick-banner").waitFor();
    await focused(button("Cancel"));
    assert.equal(await dialog().evaluate(el => el.open), false);
    assert.deepEqual(await page.evaluate(() => [window.pickerClickListeners.size, window.pickerMap.getCanvas().style.cursor]), [1, "crosshair"]);
  }
  async function ended() {
    await dialog().waitFor({ state: "visible" });
    assert.equal(await page.locator(".coordinate-pick-banner").count(), 0);
    assert.deepEqual(await page.evaluate(() => [window.pickerClickListeners.size, window.pickerMap.getCanvas().style.cursor]), [0, ""]);
  }
  async function pick() {
    const bounds = await page.locator(".mapboxgl-canvas").boundingBox();
    const point = { x: Math.round(bounds.width * 0.6), y: Math.round(bounds.height * 0.8) };
    await page.evaluate(() => {
      window.pickerMap.once("click", event => {
        window.pickerClickedCoordinates = { latitude: event.lngLat.lat.toFixed(6), longitude: event.lngLat.lng.toFixed(6) };
      });
    });
    await page.mouse.click(bounds.x + point.x, bounds.y + point.y);
    await ended();
    assert.deepEqual(await page.evaluate(() => window.pickerHandoff), { cursor: "", computed: "grab", listeners: 0 });
    const expected = await page.evaluate(() => window.pickerClickedCoordinates);
    assert.deepEqual(await value(), expected);
    await focused(field("Latitude"));
    assert.equal(await page.locator(".coordinate-preview").count(), 1);
    return expected;
  }
  async function inspectForm(editing, width) {
    assert.equal(await dialog().getAttribute("aria-describedby"), "dialog-description");
    assert.equal(await page.getByRole("heading", { name: editing ? "Edit Capital City" : "Add a New Capital City", exact: true }).isVisible(), true);
    assert.equal(await dialog().locator("a").count(), 0);
    const geometry = await dialog().evaluate(el => {
      const lat = el.querySelector('[name="latitude"]').getBoundingClientRect();
      const lng = el.querySelector('[name="longitude"]').getBoundingClientRect();
      const rect = el.getBoundingClientRect();
      return { columns: Math.abs(lat.top - lng.top) < 1, overflow: el.scrollWidth > el.clientWidth, withinViewport: rect.top >= 0 && rect.bottom <= innerHeight };
    });
    assert.deepEqual(geometry, { columns: width === 1440, overflow: false, withinViewport: true });
    await focused(field("Capital name"));
    await page.keyboard.press("Shift+Tab");
    await focused(button("Close dialog"));
    await page.keyboard.press("Tab");
    await focused(field("Capital name"));
    await button(editing ? "Save changes" : "Create capital").focus();
    await page.keyboard.press("Tab");
    // Native modal tab order may include browser chrome and the scrollable
    // dialog itself. No background control may receive document focus.
    for (let stop = 0; stop < 3 && !await button("Close dialog").evaluate(el => el === document.activeElement); stop++) {
      assert.equal(await page.evaluate(() => document.activeElement === document.body || document.activeElement === document.querySelector("dialog[open]")), true);
      await page.keyboard.press("Tab");
    }
    await focused(button("Close dialog"));
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/dialog-${editing ? "edit" : "add"}-${width}.png` });
  }
  const evidence = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    records = defaults.map(record => ({ ...record }));
    writes.length = 0;
    await page.setViewportSize({ width, height });
    await page.goto(baseURL);
    await idle();
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.evaluate(() => {
      window.originalPickerCanvas = window.pickerMap.getCanvas();
      window.originalPickerMarkers = [...window.pickerMarkers];
    });
    await showView(page, "Capitals"); await button("Add capital").click();
    await inspectForm(false, width);
    await field("Capital name").fill("Draft city");
    await field("Country name").fill("Draft country");
    await field("Latitude").fill("12.5");
    await field("Longitude").fill("-10.75");
    // Validate once: handoff must retain unrelated validation and all fields.
    await field("Capital name").fill("");
    await button("Create capital").click();
    await focused(field("Capital name"));
    assert.equal(await field("Latitude").getAttribute("aria-describedby"), "latitude-range");
    await start();
    assert.equal(await page.locator("#name-error").count(), 1);
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/picker-mode-${width}.png` });
    await button("Cancel").click();
    await ended();
    await focused(button("Select on map"));
    assert.deepEqual(await value(), { latitude: "12.5", longitude: "-10.75" });
    await field("Capital name").fill("Draft city");
    await start();
    await page.keyboard.press("Escape");
    await ended();
    await focused(button("Select on map"));
    assert.deepEqual(await value(), { latitude: "12.5", longitude: "-10.75" });
    await start();
    // Existing marker click must neither choose nor open its color/actions UI.
    await page.locator(".capital-marker").first().dispatchEvent("click");
    assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
    assert.equal(await page.locator(".coordinate-pick-banner").count(), 1);
    if (width > 700) await button("Collapse sidebar").click();
    else assert.equal(await page.getByRole("tab", { name: "Capitals", exact: true }).isDisabled(), true);
    await frame();
    assert.equal(await page.locator(".coordinate-pick-banner").isVisible(), true);
    // Panning and zooming must retain pick mode, without selecting a point.
    const bounds = await page.locator(".mapboxgl-canvas").boundingBox();
    const x = bounds.x + bounds.width / 2, y = bounds.y + bounds.height * 0.8;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x + 40, y - 25, { steps: 8 });
    await page.mouse.up();
    await idle();
    const zoom = await page.evaluate(() => window.pickerMap.getZoom());
    await page.mouse.wheel(0, -100);
    await page.waitForFunction(previous => window.pickerMap.getZoom() > previous, zoom);
    await idle();
    assert.equal(await page.locator(".coordinate-pick-banner").count(), 1);
    assert.equal(writes.length, 0);
    const first = await pick();
    assert.equal(await field("Capital name").inputValue(), "Draft city");
    assert.equal(await field("Country name").inputValue(), "Draft country");
    assert.equal(writes.length, 0);
    await start();
    await page.keyboard.press("Escape");
    await ended();
    assert.deepEqual(await value(), first);
    assert.equal(await page.locator(".coordinate-preview").count(), 0);
    await start();
    assert.equal(await page.locator(".coordinate-preview").count(), 0);
    await page.evaluate(() => window.pickerMap.panBy([20, 0], { duration: 0 }));
    const second = await pick();
    assert.notDeepEqual(second, first);
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/picker-form-${width}.png` });
    // Manual correction removes a now-outdated preview.
    await field("Latitude").fill("0");
    assert.equal(await page.locator(".coordinate-preview").count(), 0);
    await button("Create capital").click();
    await dialog().waitFor({ state: "hidden" });
    assert.deepEqual(writes, [{ method: "POST", input: { name: "Draft city", country: "Draft country", latitude: 0, longitude: Number(second.longitude) } }]);
    await page.waitForFunction(() => document.querySelectorAll(".capital-marker").length === 3);
    await button("Expand sidebar").click();
    await page.waitForFunction(() => {
      const map = window.pickerMap;
      return map.getCanvas().clientWidth === map.getContainer().clientWidth;
    });
    await showView(page, "Capitals"); await button("Show Berlin, Germany on map").click();
    await idle();
    await showView(page, "Map"); await button("Red marker").click();
    await button("Map actions for Berlin").click();
    await button("Edit").click();
    await inspectForm(true, width);
    await field("Capital name").fill("Edited Berlin");
    await start();
    assert.equal(await page.locator(".mapboxgl-popup").count(), 0);
    const edited = await pick();
    assert.equal(await field("Capital name").inputValue(), "Edited Berlin");
    assert.deepEqual(await page.evaluate(() => {
      const point = window.originalPickerMarkers[0].getLngLat();
      return [point.lat, point.lng];
    }), [52.52, 13.405]);
    assert.equal(writes.length, 1);
    failure = true;
    await button("Save changes").click();
    await page.getByRole("alert").waitFor();
    await focused(page.getByRole("alert"));
    assert.match(await page.getByRole("alert").textContent(), /already exists/);
    assert.deepEqual(await value(), edited);
    assert.equal(await page.locator(".coordinate-preview").count(), 1);
    failure = false;
    await button("Save changes").click();
    await dialog().waitFor({ state: "hidden" });
    assert.deepEqual(writes.slice(1).map(write => write.method), ["PUT", "PUT"]);
    assert.equal(await page.locator(".coordinate-preview").count(), 0);
    assert.equal(await button("Red marker").getAttribute("aria-pressed"), "true");
    assert.equal(await button("Show Edited Berlin, Germany on map").getAttribute("aria-pressed"), "true");
    await page.keyboard.press("Escape");
    await showView(page, "Capitals"); await button("Actions for Edited Berlin").click();
    await button("Edit").click();
    await start();
    await pick();
    await button("Cancel").click();
    assert.equal(writes.length, 3);
    assert.equal(await page.locator(".coordinate-preview").count(), 0);
    await showView(page, "Map");
    const geometry = await page.evaluate(() => ({
      sameCanvas: window.originalPickerCanvas === window.pickerMap.getCanvas(),
      sameMarkers: window.originalPickerMarkers.every(marker => marker.getElement().isConnected),
      squareMarkers: [...document.querySelectorAll(".capital-marker")].every(el => el.offsetWidth === 32 && el.offsetHeight === 32),
      overflow: document.documentElement.scrollWidth > innerWidth,
      listeners: window.pickerClickListeners.size,
    }));
    assert.deepEqual(geometry, { sameCanvas: true, sameMarkers: true, squareMarkers: true, overflow: false, listeners: 0 });
    evidence.push({ width, height, createEditCancelEscape: true, failedSaveDraft: true, panZoom: true, ...geometry });
    if (width === 320) {
      await showView(page, "Capitals"); await button("Actions for Edited Berlin").click();
      await button("Edit").click();
      await start();
      records = records.filter(capital => capital.id !== 1);
      await page.evaluate(async () => {
        const { useCapitalStore } = await import("/src/capital-store.ts");
        await useCapitalStore.getState().fetchCapitals();
      });
      await ended();
      assert.equal(await field("Capital name").inputValue(), "Edited Berlin");
      assert.equal(await page.locator(".coordinate-preview").count(), 0);
      assert.equal(writes.length, 3);
      await button("Cancel").click();
      await focused(button("Add capital"));
    }
  }
  const compactEvidence = [];
  for (const [width, height, largeText] of [[667, 375, false], [390, 320, false], [390, 844, true]]) {
    await page.setViewportSize({ width, height });
    await page.evaluate(large => { document.documentElement.style.fontSize = large ? "200%" : ""; }, largeText);
    await showView(page, "Capitals"); await button("Add capital").click();
    await field("Capital name").fill("Manual precision");
    await field("Country name").fill("Manual country");
    await field("Latitude").fill("91");
    await field("Longitude").fill("181");
    const beforeValidation = writes.length;
    await button("Create capital").click();
    await focused(field("Latitude"));
    assert.equal(await field("Latitude").getAttribute("aria-describedby"), "latitude-range latitude-error");
    assert.equal(await field("Longitude").getAttribute("aria-describedby"), "longitude-range longitude-error");
    await field("Latitude").fill("1");
    await field("Latitude").press("ArrowUp");
    assert.equal(await field("Latitude").inputValue(), "2");
    await field("Latitude").fill("12.12345678");
    assert.equal(await field("Latitude").inputValue(), "12.12345678");
    for (const control of [field("Capital name"), field("Longitude"), button("Select on map"), button("Create capital"), button("Close dialog")]) {
      await control.focus();
      await control.scrollIntoViewIfNeeded();
      assert.equal(await control.evaluate(el => {
        const rect = el.getBoundingClientRect();
        return rect.left >= 0 && rect.right <= innerWidth && rect.top >= 0 && rect.bottom <= innerHeight;
      }), true);
    }
    assert.equal(await dialog().evaluate(el => el.scrollWidth <= el.clientWidth), true);
    assert.equal(writes.length, beforeValidation);
    if (screenshotDirectory) await page.screenshot({ path: `${screenshotDirectory}/dialog-compact-${width}-${height}-${largeText}.png` });
    await button("Close dialog").click();
    await dialog().waitFor({ state: "hidden" });
    compactEvidence.push({ width, height, largeText, validation: true, preciseKeyboardInput: true, controlsReachable: true });
  }
  await page.evaluate(() => { document.documentElement.style.fontSize = ""; });
  await page.setViewportSize({ width: 320, height: 568 });
  await showView(page, "Capitals"); await button("Add capital").click();
  await field("Capital name").fill("Breakpoint draft");
  await start();
  for (const width of [1440, 390, 320]) {
    await page.setViewportSize({ width, height: 844 });
    await page.waitForFunction(() => window.pickerMap.getCanvas().clientWidth === window.pickerMap.getContainer().clientWidth);
    assert.equal(await page.locator(".coordinate-pick-banner").isVisible(), true);
  }
  await page.keyboard.press("Escape");
  await ended();
  assert.equal(await field("Capital name").inputValue(), "Breakpoint draft");
  await start();
  await page.evaluate(() => window.pickerSetInactive(true));
  await ended();
  assert.equal(await field("Capital name").inputValue(), "Breakpoint draft");
  await page.evaluate(() => window.pickerSetInactive(false));
  await start();
  await page.keyboard.press("Escape");
  await ended();
  await button("Close dialog").click();
  await showView(page, "Capitals"); await button("Add capital").click();
  await button("Close dialog").click();
  await dialog().waitFor({ state: "hidden" });
  await focused(button("Add capital"));
  const outsideWrites = writes.length;
  await showView(page, "Map");
  const canvasBounds = await page.locator(".mapboxgl-canvas").boundingBox();
  await page.mouse.click(canvasBounds.x + canvasBounds.width * 0.8, canvasBounds.y + canvasBounds.height * 0.8);
  assert.equal(await dialog().count(), 0);
  assert.equal(writes.length, outsideWrites);
  // Context loss cancels safely into the manual form, without an inert layer.
  await showView(page, "Capitals"); await page.getByRole("searchbox", { includeHidden: true }).fill("Berlin");
  await showView(page, "Capitals"); await chooseContinent(page, "Europe");
  await showView(page, "Capitals"); await button("Add capital").click();
  await field("Capital name").fill("Keep this draft");
  await field("Latitude").fill("0");
  await field("Longitude").fill("0");
  await start();
  await page.evaluate(() => window.pickerMap.fire("webglcontextlost"));
  await ended();
  assert.equal(await button("Select on map").isDisabled(), true);
  assert.equal(await field("Capital name").inputValue(), "Keep this draft");
  assert.deepEqual(await value(), { latitude: "0", longitude: "0" });
  await focused(field("Latitude"));
  assert.equal(await page.getByRole("searchbox", { includeHidden: true }).inputValue(), "Berlin");
  assert.equal(await continentValue(page), "Europe");
  await page.evaluate(() => window.pickerMap.fire("webglcontextrestored"));
  assert.equal(await button("Select on map").isEnabled(), true);
  await start();
  await pick();
  // A reset from another owner invalidates the action and its preview.
  await page.evaluate(async () => {
    const { useCapitalStore } = await import("/src/capital-store.ts");
    useCapitalStore.setState(state => ({ resetVersion: state.resetVersion + 1 }));
  });
  await dialog().waitFor({ state: "hidden" });
  assert.equal(await page.locator(".coordinate-preview").count(), 0);
  await showView(page, "Capitals"); await button("Add capital").click();
  await start();
  await page.evaluate(() => window.pickerRoot.unmount());
  await frame();
  assert.equal(await page.locator(".mapboxgl-canvas, .coordinate-preview, .coordinate-pick-banner").count(), 0);
  assert.deepEqual(await page.evaluate(() => [window.pickerClickListeners.size, window.originalPickerCanvas.style.cursor]), [0, ""]);
  // Missing configuration still permits the complete manual create workflow.
  noToken = true;
  await page.reload();
  await showView(page, "Capitals"); await button("Add capital").click();
  assert.equal(await button("Select on map").isDisabled(), true);
  assert.equal(await page.getByText("Map picking is unavailable. Enter coordinates manually.").isVisible(), true);
  assert.equal(await page.locator(".mapboxgl-canvas").count(), 0);
  await field("Capital name").fill("Manual city");
  await field("Country name").fill("Manual country");
  await field("Latitude").fill("0");
  await field("Longitude").fill("-180");
  const beforeManual = writes.length;
  await button("Create capital").click();
  await dialog().waitFor({ state: "hidden" });
  assert.equal(writes.length, beforeManual + 1);
  assert.deepEqual(writes.at(-1), { method: "POST", input: { name: "Manual city", country: "Manual country", latitude: 0, longitude: -180 } });
  await showView(page, "Capitals");
  await button("Show Manual city, Manual country on map").click();
  await focused(page.locator("#world-map"));
  assert.deepEqual(errors, []);
  return { viewports: evidence, compactEvidence, breakpointDraft: true, inactiveMapCleanup: true, externalRemovalDraft: true, contextLoss: true, reset: true, unmount: true, manualWithoutMap: true, errors };
}
