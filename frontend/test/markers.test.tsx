import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, type TestContext } from "node:test";
import type mapboxgl from "mapbox-gl";
import { capitalCamera, createCapitalMarkers, markerColors } from "../src/capital-markers";

const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
const paris = { id: 2, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35 };

// Minimal DOM/Mapbox doubles for controller logic. Actual CSS, native keyboard
// activation and React integration are checked separately in Chromium.
class Element extends EventTarget {
  children: Element[] = [];
  attributes = new Map<string, string>();
  style = { backgroundColor: "" };
  className = "";
  textContent = "";
  src = "";
  alt = "";
  width = 0;
  height = 0;
  hidden = false;
  disabled = false;
  tabIndex = 0;
  complete = false;
  naturalWidth = 0;
  onload?: () => void;
  onerror?: () => void;
  private markup = "";
  set innerHTML(value: string) { this.children = []; this.markup = value; }
  get innerHTML() { return this.markup; }
  value = "";
  offsetHeight = 240;
  clientHeight = 600;
  getBoundingClientRect() { return { top: 0, left: 0, right: 600, bottom: 600 }; }
  type = "";
  isConnected = true;
  focusCount = 0;
  constructor(public tag: string) { super(); }
  append(...children: Element[]) { this.children.push(...children); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  contains(element: unknown): boolean { return this === element || this.children.some((child) => child.contains(element)); }
  focus() { this.focusCount += 1; dom.activeElement = this; }
  click() { this.dispatchEvent(new Event("click")); }
}
const dom = { createElement: (tag: string) => new Element(tag), activeElement: null as Element | null, body: new Element("body") };

function setup(t: TestContext) {
  dom.activeElement = dom.body;
  const selections: (number | null)[] = [];
  const flights: unknown[] = [];
  const openedActions: { id: number; trigger: HTMLButtonElement; name: string }[] = [];
  const closedActions: HTMLButtonElement[] = [];
  let stops = 0;
  const previousDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
  Object.defineProperty(globalThis, "document", { configurable: true, value: dom });
  const markers: Marker[] = [];
  const popups: Popup[] = [];
  class Marker {
    position?: number[];
    removed = false;
    constructor(public options: { element: Element }) {
      options.element.setAttribute("role", "img");
      markers.push(this);
    }
    setLngLat(position: number[]) { this.position = position; return this; }
    addTo() { return this; }
    remove() { this.removed = true; this.options.element.isConnected = false; }
  }
  class Popup {
    position?: number[];
    content?: Element;
    element = new Element("dialog");
    closeListeners = new Set<() => void>();
    removed = false;
    constructor() { popups.push(this); }
    setLngLat(position: number[]) { this.position = position; return this; }
    setDOMContent(content: Element) { this.content = content; this.element.append(content); return this; }
    getElement() { return this.element; }
    on(_name: string, listener: () => void) { this.closeListeners.add(listener); return this; }
    off(_name: string, listener: () => void) { this.closeListeners.delete(listener); return this; }
    addTo() { return this; }
    remove() {
      this.removed = true;
      if (this.element.contains(dom.activeElement)) dom.activeElement = dom.body;
      for (const listener of this.closeListeners) listener();
      return this;
    }
  }
  const canvas = new Element("canvas");
  const controller = createCapitalMarkers({ getCanvas: () => canvas, getContainer: () => canvas,
    getZoom: () => 2, stop: () => { stops += 1; }, flyTo: (options: unknown) => flights.push(options),
  } as unknown as mapboxgl.Map, { Marker, Popup } as unknown as typeof mapboxgl, id => selections.push(id), {
    onOpen: (capital, trigger) => openedActions.push({ id: capital.id, name: capital.name, trigger }),
    onClose: trigger => closedActions.push(trigger),
  });
  t.after(() => {
    controller.destroy();
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  return { controller, markers, popups, canvas, selections, flights, openedActions, closedActions, stops: () => stops };
}

test("popup actions delegate current records without selection or camera writes and clean up on every closure", t => {
  const { controller, markers, popups, flights, selections, openedActions, closedActions } = setup(t);
  controller.update([berlin, paris]);
  for (const close of [() => popups.at(-1)!.remove(), () => controller.select(paris.id),
    () => controller.update([paris]), () => controller.destroy()]) {
    controller.update([berlin, paris]);
    controller.select(berlin.id);
    const popup = popups.at(-1)!;
    const trigger = popup.content!.children[5];
    assert.equal(trigger.type, "button");
    assert.equal(trigger.className, "actions-trigger popup-actions-trigger");
    assert.equal(trigger.attributes.get("aria-label"), "Map actions for Berlin");
    trigger.click();
    assert.equal(openedActions.at(-1)!.id, 1);
    controller.update([{ ...berlin, name: "Renamed" }, paris]);
    assert.equal(trigger.attributes.get("aria-label"), "Map actions for Renamed");
    trigger.click();
    assert.equal(openedActions.at(-1)!.name, "Renamed");
    const calls = openedActions.length;
    close();
    assert.equal(closedActions.includes(trigger as unknown as HTMLButtonElement), true);
    trigger.click();
    assert.equal(openedActions.length, calls, "detached trigger must release its listener");
    assert.equal(popup.closeListeners.size, 0);
    assert.equal(flights.length, 0);
    assert.deepEqual(selections.filter(id => id !== null), []);
  }
  assert.ok(markers.every(marker => marker.removed));
});

function choose(popup: { content?: Element }, value: string) {
  const button = popup.content!.children[3].children[1].children[markerColors.findIndex(color => color.value === value)];
  button.click();
  return button;
}

test("every valid capital gets a square marker at [longitude, latitude], including nearby capitals", (t) => {
  const { controller, markers } = setup(t);
  controller.update([berlin, paris, { ...paris, id: 3 }, { ...berlin, id: 4, latitude: NaN },
    { ...berlin, id: 5, longitude: 181 }, { ...berlin, id: 6, latitude: -91 }]);
  assert.equal(markers.length, 3);
  assert.deepEqual(markers.map((marker) => marker.position), [[13.405, 52.52], [2.35, 48.85], [2.35, 48.85]]);
  assert.equal(markers[0].options.element.className, "capital-marker");
  const css = readFileSync(new URL("../src/styles.css", import.meta.url), "utf8");
  const rule = css.match(/\.capital-marker \{([^}]+)\}/)![1];
  for (const declaration of ["width: 32px", "height: 32px", "min-height: 0", "padding: 0", "border-radius: 0", "box-sizing: border-box"]) {
    assert.ok(rule.includes(declaration));
  }
});

test("activation opens a labeled popup with safe text and an accessible current-color control", (t) => {
  const { controller, markers, popups } = setup(t);
  controller.update([{ ...berlin, name: "<img onerror=alert(1)>" }]);
  const button = markers[0].options.element;
  assert.equal(button.type, "button");
  assert.equal(button.attributes.get("role"), "button");
  assert.match(button.attributes.get("aria-label")!, /Germany: change marker color/);
  button.click();
  assert.equal(popups.length, 1);
  assert.equal(popups[0].content!.children[0].textContent, "<img onerror=alert(1)>");
  assert.equal(popups[0].content!.children[1].textContent, "Germany");
  assert.equal(popups[0].content!.children[3].children[0].textContent, "Marker color");
  assert.equal(dom.activeElement!.attributes.get("aria-label"), "Teal marker");
  assert.equal(button.attributes.get("aria-expanded"), "true");
});

test("color changes are isolated and survive popup reopen and data rerenders/reloads", (t) => {
  const { controller, markers, popups } = setup(t);
  controller.update([berlin, paris]);
  markers[0].options.element.click();
  choose(popups[0], markerColors[1].value);
  assert.equal(markers[0].options.element.style.backgroundColor, markerColors[1].value);
  assert.equal(markers[1].options.element.style.backgroundColor, markerColors[0].value);
  popups[0].remove();
  assert.equal(dom.activeElement, markers[0].options.element);
  controller.update([{ ...paris }, { ...berlin }]);
  markers[0].options.element.click();
  assert.equal(dom.activeElement!.attributes.get("aria-label"), "Red marker");
  assert.equal(markers.length, 2);
});

test("data updates reuse markers and refresh open popup text and coordinates", (t) => {
  const { controller, markers, popups } = setup(t);
  controller.update([berlin]);
  markers[0].options.element.click();
  controller.update([{ ...berlin, name: "Updated", country: "New country", longitude: 10, latitude: 20 }]);
  assert.equal(markers.length, 1);
  assert.equal(popups.length, 1);
  assert.deepEqual(markers[0].position, [10, 20]);
  assert.deepEqual(popups[0].position, [10, 20]);
  assert.equal(popups[0].content!.children[0].textContent, "Updated");
  assert.equal(popups[0].content!.children[1].textContent, "New country");
  assert.match(popups[0].element.attributes.get("aria-label")!, /Updated, New country/);
});

test("opening another marker closes the previous popup; Escape restores marker focus", (t) => {
  const { controller, markers, popups } = setup(t);
  controller.update([berlin, paris]);
  markers[0].options.element.click();
  markers[1].options.element.click();
  assert.equal(popups[0].removed, true);
  const event = new Event("keydown");
  Object.defineProperty(event, "key", { value: "Escape" });
  popups[1].element.dispatchEvent(event);
  assert.equal(popups[1].removed, true);
  assert.equal(dom.activeElement, markers[1].options.element);
  assert.equal(markers[1].options.element.attributes.get("aria-expanded"), "false");
});

test("removing an active capital moves popup focus to the canvas without focusing the removed marker", (t) => {
  const { controller, markers, popups, canvas } = setup(t);
  controller.update([berlin, paris]);
  const button = markers[0].options.element;
  button.click();
  const swatch = choose(popups[0], markerColors[1].value);
  controller.update([paris]);
  assert.equal(button.focusCount, 0);
  assert.equal(dom.activeElement, canvas);
  assert.equal(canvas.focusCount, 1);
  assert.equal(markers[0].removed, true);
  assert.equal(markers[1].removed, false);
  assert.equal(popups[0].removed, true);
  assert.equal(popups[0].closeListeners.size, 0);
  assert.equal(button.attributes.get("aria-expanded"), "false");
  swatch.click();
  assert.equal(button.style.backgroundColor, markerColors[1].value);
  button.click();
  assert.equal(popups.length, 1);
  markers[1].options.element.click();
  assert.equal(popups.length, 2);
});

test("removing a popup whose focus already moved elsewhere does not steal focus", (t) => {
  const { controller, markers, canvas } = setup(t);
  controller.update([berlin, paris]);
  const elsewhere = new Element("button");
  let berlinMarker = markers[0];
  for (const target of [elsewhere, markers[1].options.element, canvas, dom.body]) {
    berlinMarker.options.element.click();
    target.focus();
    const previousCanvasFocusCount = canvas.focusCount;
    controller.update([paris]);
    assert.equal(dom.activeElement, target);
    assert.equal(canvas.focusCount, previousCanvasFocusCount);
    assert.equal(berlinMarker.options.element.focusCount, 0);
    controller.update([berlin, paris]);
    // Re-added Berlin becomes the last marker in the mock registry.
    berlinMarker = markers.at(-1)!;
  }
});

test("normal popup closure respects focus elsewhere and unmount does not focus the outgoing canvas", (t) => {
  const { controller, markers, popups, canvas } = setup(t);
  controller.update([berlin]);
  markers[0].options.element.click();
  const elsewhere = new Element("button");
  elsewhere.focus();
  popups[0].remove();
  assert.equal(dom.activeElement, elsewhere);
  assert.equal(markers[0].options.element.focusCount, 0);
  markers[0].options.element.click();
  controller.destroy();
  assert.equal(markers[0].options.element.focusCount, 0);
  assert.equal(canvas.focusCount, 0);
  assert.equal(markers[0].removed, true);
  assert.equal(popups[1].closeListeners.size, 0);
});

test("removed capitals release markers, popups, listeners and colors; new capitals get default colors", (t) => {
  const { controller, markers, popups } = setup(t);
  controller.update([berlin, paris]);
  markers[0].options.element.click();
  const swatch = choose(popups[0], markerColors[1].value);
  controller.update([paris]);
  assert.equal(markers[0].removed, true);
  assert.equal(markers[1].removed, false);
  assert.equal(popups[0].removed, true);
  assert.equal(popups[0].closeListeners.size, 0);
  markers[0].options.element.click();
  assert.equal(popups.length, 1);
  choose({ content: popups[0].content }, markerColors[2].value);
  assert.equal(markers[0].options.element.style.backgroundColor, markerColors[1].value);
  assert.notEqual(dom.activeElement, swatch);
  controller.update([berlin, paris]);
  assert.equal(markers.length, 3);
  assert.equal(markers[2].options.element.style.backgroundColor, markerColors[0].value);
});

test("destroy releases every marker and active popup and tolerates repeated cleanup", (t) => {
  const { controller, markers, popups } = setup(t);
  controller.update([berlin, paris]);
  markers[0].options.element.click();
  controller.destroy();
  controller.destroy();
  assert.ok(markers.every((marker) => marker.removed));
  assert.equal(popups[0].removed, true);
  assert.equal(popups[0].closeListeners.size, 0);
  markers[0].options.element.click();
  assert.equal(popups.length, 1);
});

test("list selection navigates to the matching capital, reuses its popup and interrupts an earlier flight", (t) => {
  const { controller, markers, popups, flights, stops, selections } = setup(t);
  controller.update([berlin, paris]);
  controller.select(paris.id, true);
  assert.equal(popups[0].content!.children[0].textContent, "Paris");
  assert.deepEqual((flights[0] as { center: number[] }).center, [2.35, 48.85]);
  controller.select(paris.id, true);
  assert.equal(popups.length, 1);
  controller.select(berlin.id, true);
  assert.equal(popups[0].removed, true);
  assert.equal(popups[1].content!.children[0].textContent, "Berlin");
  assert.equal(markers.length, 2);
  assert.equal(stops(), 3);
  assert.equal(markers[0].options.element.attributes.get("aria-pressed"), "true");
  assert.equal(markers[1].options.element.attributes.get("aria-pressed"), "false");
  assert.deepEqual(selections, []); // Programmatic selection never loops back into the store.
  controller.select(null);
  assert.equal(popups[1].removed, true);
});

test("marker selection and closure notify the shared selection, without a stale clear when switching", (t) => {
  const { controller, markers, popups, selections } = setup(t);
  controller.update([berlin, paris]);
  markers[0].options.element.click();
  markers[1].options.element.click();
  assert.deepEqual(selections, [1, 2]);
  popups[1].remove();
  assert.deepEqual(selections, [1, 2, null]);
  markers[0].options.element.click();
  controller.update([paris]);
  assert.deepEqual(selections, [1, 2, null, 1, null]);
});

test("only a selected coordinate edit navigates; text/reloads preserve camera, popup, marker and color", (t) => {
  const { controller, markers, popups, flights } = setup(t);
  controller.update([berlin, paris]);
  controller.select(berlin.id, true);
  choose(popups[0], markerColors[2].value);
  controller.update([{ ...berlin, name: "New Berlin" }, { ...paris, latitude: 40 }]);
  assert.equal(flights.length, 1);
  controller.update([{ ...berlin, name: "New Berlin", latitude: 20, longitude: 10 }, paris]);
  assert.equal(flights.length, 2);
  assert.equal(popups[0].content!.children[2].textContent, "20.0000, 10.0000");
  assert.equal(popups[0].content!.children[2].attributes.get("aria-label"), "Latitude 20, longitude 10");
  assert.equal(markers[0].options.element.style.backgroundColor, markerColors[2].value);
  assert.equal(markers.length, 2);
  assert.equal(popups.length, 1);
});

test("camera accommodates measured popup/map height and disables animation for reduced motion", () => {
  const normal = capitalCamera(berlin, 800, 210, false);
  const mobile = capitalCamera(berlin, 320, 210, true);
  assert.deepEqual(normal.center, [13.405, 52.52]);
  assert.equal(normal.zoom, 4.5);
  assert.equal(normal.duration, 900);
  assert.equal(mobile.duration, 0);
  assert.ok(mobile.padding.top + mobile.padding.bottom <= 320);
  assert.ok(mobile.padding.top > normal.padding.bottom);
  assert.equal(mobile.retainPadding, false);
});

test("popup flags use validated metadata, fall back on image failure and update without losing color or focus", (t) => {
  const { controller, markers, popups, flights } = setup(t);
  controller.update([{ ...berlin, flagCode: "DE" }]);
  controller.select(berlin.id, true);
  const popup = popups[0];
  const flag = popup.content!.children[4];
  assert.equal(flag.attributes.get("aria-hidden"), "true");
  const image = flag.children[0];
  assert.equal(image.src, "https://flags.restcountries.com/v5/svg/de.svg");
  assert.equal(image.alt, "");
  assert.deepEqual([image.width, image.height], [40, 30]);
  assert.equal(image.hidden, true);
  image.complete = true;
  image.naturalWidth = 40;
  image.onload!();
  assert.equal(image.hidden, false);
  image.onerror!();
  assert.equal(image.hidden, true);
  assert.match(flag.innerHTML, /<svg/);
  choose(popup, markerColors[1].value);
  const focus = dom.activeElement;
  controller.update([{ ...berlin, country: "Czechia", flagCode: "CZ" }]);
  assert.equal(flag.children[0].src, "https://flags.restcountries.com/v5/svg/cz.svg");
  assert.equal(flag.children[0].hidden, true);
  flag.children[0].complete = true;
  flag.children[0].naturalWidth = 40;
  flag.children[0].onload!();
  assert.equal(flag.children[0].hidden, false);
  assert.equal(dom.activeElement, focus);
  assert.equal(flights.length, 1);
  assert.equal(popups.length, 1);
  assert.equal(markers.length, 1);
  assert.equal(markers[0].options.element.style.backgroundColor, markerColors[1].value);
  for (const code of [null, "../de", "", "DEU", undefined]) {
    controller.update([{ ...berlin, flagCode: code }]);
    assert.equal(flag.children.length, 0);
    assert.match(flag.innerHTML, /<svg/);
  }
});

test("popup flags reveal already cached images even without a later load event", (t) => {
  const { controller, markers, popups } = setup(t);
  t.mock.method(dom, "createElement", (tag: string) => {
    const element = new Element(tag);
    if (tag === "img") { element.complete = true; element.naturalWidth = 40; }
    return element;
  });
  controller.update([{ ...berlin, flagCode: "DE" }]);
  markers[0].options.element.click();
  assert.equal(popups[0].content!.children[4].children[0].hidden, false);
  controller.update([{ ...berlin, country: "Czechia", flagCode: "CZ" }]);
  assert.equal(popups[0].content!.children[4].children[0].hidden, false);
});

test("reset closes selection and restores every marker to Teal without camera movement", (t) => {
  const { controller, markers, popups, flights } = setup(t);
  controller.update([berlin, paris]);
  controller.select(berlin.id);
  choose(popups[0], markerColors[1].value);
  controller.select(paris.id);
  choose(popups[1], markerColors[2].value);
  const before = flights.length;
  controller.reset();
  assert.equal(popups[1].removed, true);
  assert.equal(flights.length, before);
  assert.ok(markers.every(marker => marker.options.element.style.backgroundColor === markerColors[0].value));
  controller.select(berlin.id);
  assert.equal(popups[2].content!.children[3].children[1].children[0].attributes.get("aria-pressed"), "true");
});

test("continent visibility retains instances and colors, blocks hidden activation and clears popup without hidden focus or flights", (t) => {
  const { controller, markers, popups, canvas, selections, flights } = setup(t);
  const europe = { ...berlin, continents: ["Europe" as const] };
  const asia = { ...paris, continents: ["Asia" as const] };
  controller.update([europe, asia]);
  controller.select(europe.id, true);
  choose(popups[0], markerColors[1].value);
  const before = flights.length;
  controller.setContinent("Asia");
  const button = markers[0].options.element;
  assert.equal(button.hidden, true);
  assert.equal(button.disabled, true);
  assert.equal(button.tabIndex, -1);
  assert.equal(popups[0].removed, true);
  assert.equal(dom.activeElement, canvas);
  assert.deepEqual(selections, [null]);
  button.click(); // Even a synthetic event cannot select a hidden entry.
  controller.select(europe.id, true);
  assert.equal(popups.length, 1);
  assert.equal(flights.length, before);
  for (const continent of ["", "Europe", "Asia", ""] as const) controller.setContinent(continent);
  assert.equal(markers.length, 2);
  assert.ok(markers.every(marker => !marker.removed && !marker.options.element.hidden));
  assert.equal(button.disabled, false);
  assert.equal(button.tabIndex, 0);
  assert.equal(button.style.backgroundColor, markerColors[1].value);
  assert.equal(flights.length, before);
  controller.select(europe.id);
  assert.equal(popups[1].content!.children[3].children[1].children[1].attributes.get("aria-pressed"), "true");
});

test("filtered CRUD and reset reconcile visibility while only actual deletion releases markers", (t) => {
  const { controller, markers, popups, flights } = setup(t);
  const europe = { ...berlin, continents: ["Europe" as const] };
  controller.setContinent("Europe");
  controller.update([europe, paris]);
  assert.equal(markers[1].options.element.hidden, true); // Unknown country.
  controller.select(europe.id);
  choose(popups[0], markerColors[2].value);
  controller.update([{ ...europe, country: "Japan", continents: ["Asia"], latitude: 20 }, paris]);
  assert.equal(popups[0].removed, true);
  assert.equal(flights.length, 0); // Excluded edit cannot navigate either.
  assert.equal(markers[0].options.element.hidden, true);
  controller.update([europe, paris]);
  assert.equal(markers[0].options.element.style.backgroundColor, markerColors[2].value);
  assert.equal(markers[0].options.element.hidden, false);
  controller.update([europe]);
  assert.equal(markers[1].removed, true);
  controller.reset();
  controller.update([{ ...europe, id: 101 }, { ...paris, id: 102 }]);
  assert.equal(markers[0].removed, true);
  assert.equal(markers[2].options.element.hidden, false);
  assert.equal(markers[3].options.element.hidden, true);
  assert.equal(markers[2].options.element.style.backgroundColor, markerColors[0].value);
});
