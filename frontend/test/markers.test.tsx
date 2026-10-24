import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test, type TestContext } from "node:test";
import type mapboxgl from "mapbox-gl";
import { createCapitalMarkers, markerColors } from "../src/capital-markers";

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
  value = "";
  type = "";
  isConnected = true;
  constructor(public tag: string) { super(); }
  append(...children: Element[]) { this.children.push(...children); }
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  contains(element: unknown): boolean { return this === element || this.children.some((child) => child.contains(element)); }
  focus() { dom.activeElement = this; }
  click() { this.dispatchEvent(new Event("click")); }
}
const dom = { createElement: (tag: string) => new Element(tag), activeElement: null as Element | null, body: new Element("body") };

function setup(t: TestContext) {
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
  const controller = createCapitalMarkers({} as mapboxgl.Map, { Marker, Popup } as unknown as typeof mapboxgl);
  t.after(() => {
    controller.destroy();
    if (previousDocument) Object.defineProperty(globalThis, "document", previousDocument);
    else Reflect.deleteProperty(globalThis, "document");
  });
  return { controller, markers, popups };
}

function choose(popup: { content?: Element }, value: string) {
  const select = popup.content!.children[2].children[0];
  select.value = value;
  select.dispatchEvent(new Event("change"));
  return select;
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
  assert.equal(popups[0].content!.children[2].textContent, "Marker color");
  assert.equal(dom.activeElement!.value, markerColors[0].value);
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
  assert.equal(dom.activeElement!.value, markerColors[1].value);
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

test("removed capitals release markers, popups, listeners and colors; new capitals get default colors", (t) => {
  const { controller, markers, popups } = setup(t);
  controller.update([berlin, paris]);
  markers[0].options.element.click();
  const select = choose(popups[0], markerColors[1].value);
  controller.update([paris]);
  assert.equal(markers[0].removed, true);
  assert.equal(markers[1].removed, false);
  assert.equal(popups[0].removed, true);
  assert.equal(popups[0].closeListeners.size, 0);
  markers[0].options.element.click();
  assert.equal(popups.length, 1);
  choose({ content: popups[0].content }, markerColors[2].value);
  assert.equal(markers[0].options.element.style.backgroundColor, markerColors[1].value);
  assert.notEqual(dom.activeElement, select);
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
