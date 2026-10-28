import assert from "node:assert/strict";
import { test, type TestContext } from "node:test";
import type mapboxgl from "mapbox-gl";
import { capitalCamera, createCapitalMarkers, markerColors } from "../src/capital-markers";
import { mockStorage } from "./storage-fixture";
import { markerColorStorageKey, clearMarkerColors } from "../src/marker-color-storage";

const berlin = { id: 1, name: "Berlin", country: "Germany", latitude: 52.52, longitude: 13.405 };
const paris = { id: 2, name: "Paris", country: "France", latitude: 48.85, longitude: 2.35 };

test("pick mode closes popups without clearing selection and suppresses marker/list activation and flights", t => {
  const { controller, markers, popups, selections, flights } = setup(t);
  controller.update([berlin, paris]);
  controller.select(berlin.id);
  controller.setPicking(true);
  assert.equal(popups[0].removed, true);
  markers[1].options.element.click();
  controller.select(paris.id, true);
  controller.resize();
  assert.equal(popups.length, 1);
  assert.deepEqual(selections, []);
  assert.deepEqual(flights, []);
  controller.setPicking(false);
  controller.select(berlin.id);
  assert.equal(popups.length, 2);
  assert.equal(markers.length, 2);
  markers[1].options.element.click();
  assert.deepEqual(selections, [paris.id]);
});

// Minimal DOM/Mapbox doubles for controller logic. Actual CSS, native keyboard
// activation and React integration are checked separately in Chromium.
class Element extends EventTarget {
  children: Element[] = [];
  attributes = new Map<string, string>();
  style = { backgroundColor: "" };
  className = "";
  private text = "";
  get textContent(): string { return this.text + this.children.map(child => child.textContent).join(""); }
  set textContent(value: string) { this.text = value; this.children = []; }
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
  offsetHeight = 240;
  clientHeight = 600;
  clientWidth = 800;
  getBoundingClientRect() { return { top: 0, left: 0, right: 600, bottom: 600 }; }
  type = "";
  isConnected = true;
  focusCount = 0;
  constructor(public tag: string) { super(); }
  find(predicate: (element: Element) => boolean): Element | undefined {
    if (predicate(this)) return this;
    for (const child of this.children) {
      const found = child.find(predicate);
      if (found) return found;
    }
  }
  append(...children: Element[]) { this.children.push(...children); }
  replaceChildren(...children: Element[]) { this.children = children; }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  contains(element: unknown): boolean { return this === element || this.children.some((child) => child.contains(element)); }
  focus() { this.focusCount += 1; dom.activeElement = this; }
  click() { this.dispatchEvent(new Event("click")); }
}
const dom = { createElement: (tag: string) => new Element(tag), activeElement: null as Element | null, body: new Element("body") };

function byTag(root: Element, tag: string): Element {
  const element = root.find(node => node.tag === tag);
  assert.ok(element, `Missing <${tag}>`);
  return element;
}
function byName(root: Element, name: string): Element {
  const element = root.find(node => node.attributes.get("aria-label") === name);
  assert.ok(element, `Missing accessible name: ${name}`);
  return element;
}

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
  const dispose = () => {
    controller.destroy();
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  };
  t.after(dispose);
  return { controller, markers, popups, canvas, selections, flights, openedActions, closedActions, stops: () => stops, dispose };
}

test("popup actions delegate current records without selection or camera writes and clean up on every closure", t => {
  const { controller, markers, popups, flights, selections, openedActions, closedActions } = setup(t);
  controller.update([berlin, paris]);
  for (const close of [() => popups.at(-1)!.remove(), () => controller.select(paris.id),
    () => controller.update([paris]), () => controller.destroy()]) {
    controller.update([berlin, paris]);
    controller.select(berlin.id);
    const popup = popups.at(-1)!;
    const trigger = byName(popup.content!, "Map actions for Berlin");
    assert.equal(trigger.type, "button");
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
  const color = markerColors.find(color => color.value === value)!;
  const button = byName(popup.content!, `${color.name} marker`);
  button.click();
  return button;
}

test("country edits update the open definition list and clear stale facts without replacing marker/popup, color or selection", t => {
  const { controller, markers, popups, flights, selections } = setup(t);
  controller.update([{ ...berlin, flagCode: "DE", continents: ["Europe"], population: 83200000, currencies: [{ code: "EUR", name: "Euro" }] }]);
  controller.select(1);
  const popup = popups[0], marker = markers[0];
  const facts = byTag(popup.content!, "dl");
  const texts = () => facts.children.map(child => child.textContent);
  assert.deepEqual(texts(), ["Continent", "Europe", "Country population", "83,200,000", "Currency", "Euro (EUR)"]);
  assert.deepEqual(facts.children.map(child => child.tag), ["dt", "dd", "dt", "dd", "dt", "dd"]);
  choose(popup, markerColors[2].value);
  controller.update([{ ...berlin, country: "Japan", flagCode: "JP", continents: ["Asia"], population: 123000000, currencies: [{ code: "JPY", name: "Japanese yen" }] }]);
  assert.deepEqual(texts(), ["Continent", "Asia", "Country population", "123,000,000", "Currency", "Japanese yen (JPY)"]);
  controller.update([{ ...berlin, name: "<img src=x onerror=alert(1)>", country: "Unknown" }]);
  assert.deepEqual(texts(), ["Continent", "—", "Country population", "—", "Currency", "—"]);
  assert.equal(byTag(popup.content!, "h2").textContent, "<img src=x onerror=alert(1)>");
  assert.equal(facts.innerHTML, "");
  assert.equal(markers.length, 1);
  assert.equal(popups.length, 1);
  assert.equal(markers[0], marker);
  assert.equal(marker.options.element.style.backgroundColor, markerColors[2].value);
  assert.equal(marker.options.element.attributes.get("aria-pressed"), "true");
  assert.equal(byTag(popup.content!, "p").textContent, "Unknown");
  assert.match(popup.element.attributes.get("aria-label")!, /Unknown/);
  assert.equal(popup.removed, false);
  assert.deepEqual(selections, []);
  assert.deepEqual(flights, []);
});

test("longer popup edits stay within the available height without a camera or selection change", t => {
  const { controller, popups, markers, flights, selections } = setup(t);
  controller.update([berlin]);
  controller.select(berlin.id);
  const popup = popups[0];
  const content = popup.content!;
  // The marker anchors the bottom at 300px; edited text can otherwise grow
  // above a full-height map's top edge. Keep the existing internal scroller.
  content.getBoundingClientRect = () => ({ top: -42, left: 10, right: 296, bottom: 300 });
  controller.update([{ ...berlin, country: "A much longer country name" }]);
  assert.equal((content.style as unknown as CSSStyleDeclaration).maxHeight, "292px");
  assert.equal(popups.length, 1);
  assert.equal(markers.length, 1);
  assert.equal(popup.removed, false);
  assert.deepEqual(flights, []);
  assert.deepEqual(selections, []);
});

test("every valid capital gets a marker at [longitude, latitude], including nearby capitals", (t) => {
  const { controller, markers } = setup(t);
  controller.update([berlin, paris, { ...paris, id: 3 }, { ...berlin, id: 4, latitude: NaN },
    { ...berlin, id: 5, longitude: 181 }, { ...berlin, id: 6, latitude: -91 }]);
  assert.equal(markers.length, 3);
  assert.deepEqual(markers.map((marker) => marker.position), [[13.405, 52.52], [2.35, 48.85], [2.35, 48.85]]);
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
  assert.equal(byTag(popups[0].content!, "h2").textContent, "<img onerror=alert(1)>");
  assert.equal(byTag(popups[0].content!, "p").textContent, "Germany");
  assert.equal(byTag(byName(popups[0].content!, "Marker color"), "p").textContent, "Marker color");
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
  choose(popups[0], markerColors[1].value);
  controller.update([paris]);
  assert.equal(button.focusCount, 0);
  assert.equal(dom.activeElement, canvas);
  assert.equal(canvas.focusCount, 1);
  assert.equal(markers[0].removed, true);
  assert.equal(markers[1].removed, false);
  assert.equal(popups[0].removed, true);
  assert.equal(popups[0].closeListeners.size, 0);
  assert.equal(button.attributes.get("aria-expanded"), "false");
  choose(popups[0], markerColors[2].value);
  assert.equal(button.style.backgroundColor, markerColors[1].value);
  button.click();
  assert.equal(popups.length, 1);
  markers[1].options.element.click();
  assert.equal(popups.length, 2);
  controller.update([berlin, paris]);
  assert.equal(markers[2].options.element.style.backgroundColor, markerColors[0].value);
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
  assert.equal(byTag(popups[0].content!, "h2").textContent, "Paris");
  assert.deepEqual((flights[0] as { center: number[] }).center, [2.35, 48.85]);
  controller.select(paris.id, true);
  assert.equal(popups.length, 1);
  controller.select(berlin.id, true);
  assert.equal(popups[0].removed, true);
  assert.equal(byTag(popups[1].content!, "h2").textContent, "Berlin");
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
  assert.deepEqual(markers[0].position, [10, 20]);
  assert.deepEqual(popups[0].position, [10, 20]);
  assert.equal(byName(popups[0].content!, "Latitude 20, longitude 10").textContent, "20.0000, 10.0000");
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
  const flag = popup.content!.find(node => node.className === "country-flag")!;
  assert.equal(flag.attributes.get("aria-hidden"), "true");
  const image = byTag(flag, "img");
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
  assert.equal(byTag(flag, "img").src, "https://flags.restcountries.com/v5/svg/cz.svg");
  assert.equal(byTag(flag, "img").hidden, true);
  byTag(flag, "img").complete = true;
  byTag(flag, "img").naturalWidth = 40;
  byTag(flag, "img").onload!();
  assert.equal(byTag(flag, "img").hidden, false);
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
  assert.equal(byTag(popups[0].content!, "img").hidden, false);
  controller.update([{ ...berlin, country: "Czechia", flagCode: "CZ" }]);
  assert.equal(byTag(popups[0].content!, "img").hidden, false);
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
  assert.equal(byName(popups[2].content!, "Teal marker").attributes.get("aria-pressed"), "true");
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
  assert.equal(byName(popups[1].content!, "Red marker").attributes.get("aria-pressed"), "true");
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

test("persisted colors restore on new controllers with selected swatches and stable markers across edit/filter/read", t => {
  const { values } = mockStorage(t, {
    [markerColorStorageKey]: JSON.stringify({ 1: markerColors[1].value, 2: markerColors[2].value }),
  });
  const { controller, markers, popups, dispose } = setup(t);
  const records = [{ ...berlin, continents: ["Europe" as const] }, paris];
  controller.update(records);
  assert.deepEqual(markers.map(marker => marker.options.element.style.backgroundColor), [markerColors[1].value, markerColors[2].value]);
  controller.select(1);
  const red = byName(popups.at(-1)!.content!, "Red marker");
  assert.equal(red.attributes.get("aria-pressed"), "true");
  assert.equal(red.textContent, "✓");
  controller.setContinent("Asia"); controller.setContinent("");
  controller.update([{ ...records[0], name: "Changed", country: "Changed country", latitude: 0 }, records[1]]);
  controller.select(1);
  assert.equal(dom.activeElement!.attributes.get("aria-label"), "Red marker");
  assert.equal(markers.length, 2);
  choose(popups.at(-1)!, markerColors[3].value);
  assert.deepEqual(JSON.parse(values.get(markerColorStorageKey)!), { 1: markerColors[3].value, 2: markerColors[2].value });
  dispose();
  const reloaded = setup(t);
  reloaded.controller.update([berlin, paris, { ...paris, id: 3 }]);
  assert.deepEqual(reloaded.markers.map(marker => marker.options.element.style.backgroundColor), [markerColors[3].value, markerColors[2].value, markerColors[0].value]);
  clearMarkerColors(); reloaded.controller.reset();
  assert.ok(reloaded.markers.every(marker => marker.options.element.style.backgroundColor === markerColors[0].value));
  reloaded.dispose();
  const afterReset = setup(t);
  afterReset.controller.update([berlin, paris]);
  assert.ok(afterReset.markers.every(marker => marker.options.element.style.backgroundColor === markerColors[0].value));
});

test("failed storage writes leave immediate marker color, swatch, popup reopen and filter behavior usable", t => {
  mockStorage(t);
  Object.defineProperty(globalThis, "localStorage", { configurable: true, get: () => { throw new Error("SecurityError"); } });
  const { controller, markers, popups } = setup(t);
  controller.update([berlin, paris]); controller.select(1);
  const swatch = choose(popups.at(-1)!, markerColors[1].value);
  assert.equal(swatch.attributes.get("aria-pressed"), "true");
  controller.setContinent("Asia"); controller.setContinent("");
  controller.update([{ ...berlin, country: "Changed" }, paris]); controller.select(1);
  assert.equal(dom.activeElement!.attributes.get("aria-label"), "Red marker");
  assert.equal(markers[0].options.element.style.backgroundColor, markerColors[1].value);
  assert.equal(markers.length, 2);
});

test("zero-sized hidden maps never calculate a flight; showing the same selection reuses marker and popup", t => {
  const { controller, canvas, markers, popups, flights } = setup(t);
  controller.update([berlin]);
  canvas.clientWidth = 0;
  canvas.clientHeight = 0;
  controller.select(berlin.id, true);
  assert.equal(flights.length, 0);
  canvas.clientWidth = 390;
  canvas.clientHeight = 650;
  controller.select(berlin.id, true);
  assert.equal(flights.length, 1);
  assert.equal(markers.length, 1);
  assert.equal(popups.length, 1);
  assert.deepEqual((flights[0] as { center: number[] }).center, [13.405, 52.52]);
});
