/* global document, window, getComputedStyle, MutationObserver, innerWidth, innerHeight */
import assert from "node:assert/strict";

// Real React/CSS; all CRUD/reset requests stay in this fixture. No map/network
// prerequisite for the toast itself. Existing suites cover the real Mapbox flows.
export async function verifyToast(page, baseURL, screenshotDirectory) {
  page.setDefaultTimeout(15_000);
  const defaults = [{ id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 }];
  let records = [...defaults], fail = false, hold = false, release, writeHeld;
  const writes = [], errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/capital{,-reset,/*}", async route => {
    const request = route.request(), method = request.method();
    if (method === "GET") return route.fulfill({ json: records });
    writes.push(method);
    if (hold) await new Promise(resolve => { release = resolve; writeHeld(); });
    if (fail) return route.fulfill({ status: 409, json: {} });
    if (request.url().endsWith("/capital-reset")) {
      records = [...defaults];
      return route.fulfill({ json: records });
    }
    const id = Number(request.url().split("/").pop());
    if (method === "DELETE") {
      records = records.filter(capital => capital.id !== id);
      return route.fulfill({ status: 204 });
    }
    const saved = { ...request.postDataJSON(), id: method === "POST" ? 2 : id };
    records = records.filter(capital => capital.id !== saved.id).concat(saved);
    return route.fulfill({ status: method === "POST" ? 201 : 200, json: saved });
  });
  await page.route("**/src/Map.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    assert.match(source, /const token =[^;]+;/);
    await route.fulfill({ response, body: source.replace(/const token =[^;]+;/, "const token = undefined;") });
  });
  // Exercise replacement via the real context setter: normal UI entry points
  // deliberately clear a previous notice before opening their next dialog.
  await page.route("**/src/CapitalActions.tsx", async route => {
    const response = await route.fetch(), source = await response.text();
    const anchor = 'const [notice, setNotice] = useState("");';
    assert.ok(source.includes(anchor));
    await route.fulfill({ response, body: source.replace(anchor, `${anchor}\nwindow.setToastNotice = setNotice;`) });
  });
  const button = name => page.getByRole("button", { name, exact: true });
  const notice = page.locator(".mutation-notice");
  const focused = async locator => {
    await page.waitForFunction(el => document.activeElement === el, await locator.elementHandle());
  };
  const empty = async () => {
    assert.equal(await notice.textContent(), "");
    assert.deepEqual(await notice.evaluate(el => ({ name: getComputedStyle(el).animationName,
      transition: getComputedStyle(el).transitionDuration, animations: el.getAnimations().length,
      height: el.getBoundingClientRect().height })), { name: "none", transition: "0s", animations: 0, height: 0 });
  };
  const setNotice = async text => {
    await page.evaluate(text => window.setToastNotice(text), text);
    await page.waitForFunction(text => document.querySelector(".mutation-notice").textContent === text, text);
  };
  const entrance = async (text, duration, trigger) => {
    await page.waitForFunction(text => window.toastSnapshot?.text === text, text);
    const snapshot = await page.evaluate(() => window.toastSnapshot);
    assert.equal(snapshot.sameNode, true, "the polite live region must stay mounted");
    assert.equal(snapshot.text, text, "text must already be present while opacity is still zero");
    assert.deepEqual(snapshot.attributes, ["status", "polite", "true", null, null]);
    assert.deepEqual(snapshot.style, { display: "block", visibility: "visible", pointer: "none", transition: "0s", transform: "none", translate: "none", scale: "none" });
    assert.equal(snapshot.timing.duration, duration);
    assert.equal(snapshot.timing.delay, 0);
    assert.equal(snapshot.timing.iterations, 1);
    // CSS animation easing belongs to its keyframe segments, not WAAPI's
    // additional effect-level easing (which remains linear).
    assert.equal(snapshot.frames[0].easing, "cubic-bezier(0.23, 1, 0.32, 1)");
    assert.deepEqual(snapshot.frames.map(frame => frame.opacity), ["0", "1"]);
    assert.deepEqual([...new Set(snapshot.frames.flatMap(frame => Object.keys(frame)
      .filter(key => !["offset", "computedOffset", "easing", "composite"].includes(key))))], ["opacity"]);
    assert.equal(await page.getByRole("status").filter({ hasText: text }).count(), 1);
    await focused(trigger);
    assert.equal(await notice.evaluate(el => el.getAnimations().length), 1);
    // Scrub the real CSS animation instead of depending on wall-clock scheduling.
    assert.deepEqual(await notice.evaluate(el => {
      const animation = window.toastAnimation;
      animation.currentTime = 0;
      const start = getComputedStyle(el).opacity;
      animation.currentTime = animation.effect.getTiming().duration / 2;
      const middle = Number(getComputedStyle(el).opacity);
      animation.finish();
      return [start, middle > 0 && middle < 1, getComputedStyle(el).opacity];
    }), ["0", true, "1"]);
    assert.equal(await notice.evaluate(el => {
      const r = el.getBoundingClientRect();
      return r.left >= 0 && r.top >= 0 && r.right <= innerWidth && r.bottom <= innerHeight
        && !el.contains(document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2));
    }), true);
  };
  const evidence = [];
  for (const [width, height] of [[1440, 900], [390, 844], [320, 568]]) {
    records = [...defaults];
    await page.setViewportSize({ width, height });
    await page.goto(baseURL);
    await button("Actions for Berlin").waitFor();
    await page.evaluate(() => {
      window.toastRegion = document.querySelector(".mutation-notice");
      window.toastEntrances = 0;
      new MutationObserver(() => {
        const el = window.toastRegion, animation = el.getAnimations()[0];
        if (!el.textContent || !animation || animation === window.toastAnimation) return;
        window.toastAnimation = animation;
        window.toastEntrances++;
        animation.pause();
        animation.currentTime = 0;
        const style = getComputedStyle(el);
        window.toastSnapshot = { text: el.textContent, sameNode: el === document.querySelector(".mutation-notice"),
          attributes: ["role", "aria-live", "aria-atomic", "aria-hidden", "tabindex"].map(name => el.getAttribute(name)),
          style: { display: style.display, visibility: style.visibility, pointer: style.pointerEvents,
            transition: style.transitionDuration, transform: style.transform, translate: style.translate, scale: style.scale },
          timing: animation.effect.getTiming(), frames: animation.effect.getKeyframes() };
      }).observe(window.toastRegion, { childList: true, characterData: true, subtree: true });
    });
    await empty();
    for (const [reducedMotion, duration] of [["no-preference", 160], ["reduce", 80]]) {
      await page.emulateMedia({ reducedMotion });
      const before = writes.length;
      await button("Add capital").focus();
      await page.keyboard.press("Enter");
      await button("Create capital").click();
      await focused(page.getByLabel("Capital name", { exact: true }));
      await empty();
      for (const [label, value] of [["Capital name", "Audit capital"], ["Country name", "Audit country"], ["Latitude", "10"], ["Longitude", "20"]]) {
        await page.getByLabel(label, { exact: true }).fill(value);
      }
      hold = true;
      const held = new Promise(resolve => { writeHeld = resolve; });
      await button("Create capital").click();
      await held;
      await page.getByText("Saving capital…", { exact: true }).waitFor();
      await empty();
      assert.equal(await page.locator(".capital-dialog").evaluate(el => el.getAnimations({ subtree: true }).length), 0);
      release(); hold = false;
      await entrance("Capital created.", duration, button("Add capital"));
      await button("Actions for Berlin").click();
      await button("Edit").click();
      await empty();
      await button("Save changes").click();
      await entrance("Capital updated.", duration, button("Actions for Berlin"));
      await button("Actions for Audit capital").click();
      await button("Delete").click();
      await button("Delete capital").click();
      await entrance("Capital deleted.", duration, button("Add capital"));
      await button("Reset to default").click();
      await button("Reset capitals").click();
      await entrance("Default capitals restored. Marker colors reset to Teal.", duration, button("Reset to default"));
      assert.equal(writes.length, before + 4);
      if (screenshotDirectory && reducedMotion === "no-preference") {
        await page.screenshot({ path: `${screenshotDirectory}/toast-entrance-${width}.png` });
      }
      await setNotice(""); await empty();
      fail = true;
      await button("Actions for Berlin").click();
      await button("Edit").click();
      await button("Save changes").click();
      const alert = page.getByRole("alert");
      await alert.waitFor(); await focused(alert); await empty();
      assert.equal(await alert.evaluate(el => el.getAnimations().length), 0);
      await page.keyboard.press("Escape"); fail = false;
    }
    // No re-entry during the running animation, after completion, or on focus/Tab.
    await page.getByRole("searchbox").focus();
    await setNotice("Capital created.");
    const count = await page.evaluate(() => window.toastEntrances);
    await page.evaluate(() => { window.toastAnimation.currentTime = 20; });
    await setNotice("Capital updated.");
    assert.equal(await page.evaluate(() => window.toastEntrances), count);
    assert.equal(await notice.evaluate(el => el.getAnimations()[0] === window.toastAnimation), true);
    assert.equal(await page.evaluate(() => window.toastAnimation.currentTime), 20);
    await focused(page.getByRole("searchbox"));
    await page.evaluate(() => window.toastAnimation.finish());
    await setNotice("Capital deleted.");
    await page.keyboard.press("Tab");
    assert.equal(await page.evaluate(() => window.toastEntrances), count);
    assert.equal(await notice.evaluate(el => getComputedStyle(el).opacity), "1");
    await setNotice(""); await empty();
    await setNotice("Capital created.");
    assert.equal(await page.evaluate(() => window.toastEntrances), count + 1);
    await page.evaluate(() => window.toastAnimation.finish());
    evidence.push({ width, height, durations: [160, 80], crudAndReset: true, opacityOnly: true,
      liveRegionPreserved: true, noFocusOrPointerInterference: true, noReplacementReplay: true, fullyVisible: true });
  }
  // Broad time margins with a controlled clock, not millisecond-precise waits.
  await page.clock.install();
  await setNotice(""); await setNotice("Capital created.");
  await page.clock.fastForward(2500);
  await setNotice("Capital updated.");
  await page.clock.fastForward(2000); // Past the old timer, before the replacement's timer.
  assert.equal(await notice.textContent(), "Capital updated.");
  await page.clock.fastForward(1500);
  assert.equal(await notice.textContent(), "Capital updated.");
  await page.clock.fastForward(600);
  await page.waitForFunction(() => document.querySelector(".mutation-notice").textContent === "");
  await empty();
  assert.deepEqual(errors, []);
  return { viewports: evidence, timerAndImmediateDismissal: true, failedWriteNoSuccess: true, mockedWrites: writes.length, pageErrors: errors };
}
