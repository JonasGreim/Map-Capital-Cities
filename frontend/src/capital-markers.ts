import mapboxgl from "mapbox-gl";
import { matchesContinent, type ContinentFilter } from "./continent-filter";
import type { Capital } from "./api";
import { updateCountryFlag } from "./country-flag";
import { markerColors } from "./marker-colors";
import { readMarkerColor, saveMarkerColor } from "./marker-color-storage";
import { countryFacts } from "./country-facts";

export { markerColors } from "./marker-colors";

type Entry = {
  capital: Capital;
  marker: mapboxgl.Marker;
  button: HTMLButtonElement;
  color: string;
  visible: boolean;
  popup?: mapboxgl.Popup;
  heading?: HTMLHeadingElement;
  country?: HTMLParagraphElement;
  flag?: HTMLSpanElement;
  coordinates?: HTMLParagraphElement;
  facts?: HTMLDListElement;
  actions?: HTMLButtonElement;
  focusColor?: () => void;
  content?: HTMLDivElement;
  disposePopup?: (returnFocus?: boolean, notify?: boolean) => void;
  open: (event: Event) => void;
};

// The sidebar occupies its own grid cell. Measure only the actual map and popup
// to reserve room above the square, including on the stacked mobile layout.
export function capitalCamera(capital: Capital, height: number, popupHeight: number, reducedMotion: boolean, zoom = 4.5) {
  const edge = 32;
  return { center: [capital.longitude, capital.latitude] as [number, number], zoom,
    padding: { top: Math.min(popupHeight + edge * 3, Math.max(edge, height - edge)), bottom: edge / 2, left: edge, right: edge },
    retainPadding: false, duration: reducedMotion ? 0 : 900 };
}

const coordinates = (capital: Capital) => `${capital.latitude.toFixed(4)}, ${capital.longitude.toFixed(4)}`;

function updateFacts(element: HTMLDListElement, capital: Capital) {
  element.replaceChildren(...countryFacts(capital).flatMap(([label, value]) => {
    const term = document.createElement("dt");
    term.textContent = label;
    const description = document.createElement("dd");
    description.textContent = value;
    return [term, description];
  }));
}

// Each ID owns its marker and current color for as long as it is in the data.
export function createCapitalMarkers(map: mapboxgl.Map, api = mapboxgl, onSelectionChange: (id: number | null, closedId?: number) => void = () => {},
  actions?: { onOpen: (capital: Capital, trigger: HTMLButtonElement) => void; onClose: (trigger: HTMLButtonElement) => void }) {
  const entries = new globalThis.Map<number, Entry>();
  let active: Entry | undefined;
  let continent: ContinentFilter = "";

  function updateVisibility(entry: Entry) {
    const visible = matchesContinent(entry.capital, continent);
    const hadFocus = entry.button === document.activeElement || entry.popup?.getElement()?.contains(document.activeElement);
    entry.visible = visible;
    entry.button.hidden = !visible;
    entry.button.disabled = !visible;
    entry.button.tabIndex = visible ? 0 : -1;
    entry.button.setAttribute("aria-hidden", String(!visible));
    if (!visible) {
      entry.disposePopup?.(false);
      if (hadFocus) map.getCanvas().focus({ preventScroll: true });
    }
  }

  function navigate(entry: Entry, zoom?: number) {
    map.stop();
    const height = map.getContainer().clientHeight;
    const popupHeight = entry.popup?.getElement()?.offsetHeight ?? 0;
    map.flyTo(capitalCamera(entry.capital, height, popupHeight, globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false, zoom));
  }

  function fitPopup(entry: Entry) {
    const container = map.getContainer();
    if (entry.content) entry.content.style.maxHeight = `${Math.max(160, container.clientHeight - 112)}px`;
    const bounds = entry.popup?.getElement()?.getBoundingClientRect();
    const viewport = container.getBoundingClientRect();
    if (bounds && (bounds.top < viewport.top + 64 || bounds.left < viewport.left
      || bounds.right > viewport.right || bounds.bottom > viewport.bottom)) navigate(entry, map.getZoom());
  }

  function open(entry: Entry) {
    if (!entry.visible || entry.popup) return;
    active?.disposePopup?.(false, false);
    const content = document.createElement("div");
    content.className = "capital-popup";
    content.style.maxHeight = `${Math.max(160, map.getContainer().clientHeight - 112)}px`;
    const heading = document.createElement("h2");
    heading.textContent = entry.capital.name;
    const country = document.createElement("p");
    country.className = "popup-country";
    country.textContent = entry.capital.country;
    const flag = document.createElement("span");
    updateCountryFlag(flag, entry.capital.flagCode);
    const location = document.createElement("p");
    location.className = "popup-coordinates";
    location.setAttribute("aria-label", `Latitude ${entry.capital.latitude}, longitude ${entry.capital.longitude}`);
    location.textContent = coordinates(entry.capital);
    const facts = document.createElement("dl");
    facts.className = "popup-facts";
    updateFacts(facts, entry.capital);
    const colors = document.createElement("div");
    colors.className = "popup-colors";
    colors.setAttribute("role", "group");
    colors.setAttribute("aria-label", "Marker color");
    const label = document.createElement("p");
    label.textContent = "Marker color";
    const swatches = document.createElement("div");
    swatches.className = "color-swatches";
    const listeners: (() => void)[] = [];
    const buttons = markerColors.map((color) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "color-swatch";
      button.style.backgroundColor = color.value;
      button.setAttribute("aria-label", `${color.name} marker`);
      button.setAttribute("title", color.name);
      button.setAttribute("aria-pressed", String(entry.color === color.value));
      const choose = () => {
        entry.color = color.value;
        entry.button.style.backgroundColor = entry.color;
        saveMarkerColor(entry.capital.id, entry.color);
        buttons.forEach((swatch, index) => {
          const selected = markerColors[index].value === entry.color;
          swatch.setAttribute("aria-pressed", String(selected));
          swatch.textContent = selected ? "✓" : "";
        });
      };
      button.textContent = entry.color === color.value ? "✓" : "";
      button.addEventListener("click", choose);
      listeners.push(() => button.removeEventListener("click", choose));
      swatches.append(button);
      return button;
    });
    colors.append(label, swatches);
    content.append(heading, country, location, facts, colors, flag);
    const trigger = document.createElement("button");
    trigger.type = "button";
    trigger.id = `popup-actions-${entry.capital.id}`;
    trigger.className = "actions-trigger popup-actions-trigger";
    trigger.setAttribute("aria-label", `Map actions for ${entry.capital.name}`);
    trigger.setAttribute("aria-expanded", "false");
    trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="12" cy="19" r="1.7"/></svg>';
    const showActions = (event: Event) => { event.stopPropagation(); actions?.onOpen(entry.capital, trigger); };
    trigger.addEventListener("click", showActions);
    listeners.push(() => { trigger.removeEventListener("click", showActions); actions?.onClose(trigger); });
    content.append(trigger);
    const popup = new api.Popup({ offset: 24, anchor: "bottom", maxWidth: "288px", focusAfterOpen: false })
      .setLngLat([entry.capital.longitude, entry.capital.latitude])
      .setDOMContent(content);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      popup.remove();
    };
    let returnFocus = true;
    let notify = true;
    const onClose = () => {
      // Mapbox detaches the dialog before emitting close, moving focus to body.
      // Respect focus already moved to another control, a dialog or the canvas.
      const restoreFocus = dialog?.contains(document.activeElement) || document.activeElement === document.body;
      listeners.forEach((dispose) => dispose());
      dialog?.removeEventListener("keydown", escape);
      popup.off("close", onClose);
      entry.popup = undefined;
      entry.heading = undefined;
      entry.country = undefined;
      entry.flag = undefined;
      entry.coordinates = undefined;
      entry.facts = undefined;
      entry.actions = undefined;
      entry.focusColor = undefined;
      entry.content = undefined;
      entry.disposePopup = undefined;
      entry.button.setAttribute("aria-expanded", "false");
      entry.button.setAttribute("aria-pressed", "false");
      if (active === entry) {
        active = undefined;
        if (notify) onSelectionChange(null, entry.capital.id);
      }
      if (returnFocus && restoreFocus && entry.button.isConnected) entry.button.focus({ preventScroll: true });
    };
    popup.on("close", onClose);
    entry.popup = popup;
    entry.heading = heading;
    entry.country = country;
    entry.flag = flag;
    entry.coordinates = location;
    entry.facts = facts;
    entry.actions = trigger;
    entry.content = content;
    entry.disposePopup = (restoreFocus = true, notifySelection = true) => { returnFocus = restoreFocus; notify = notifySelection; popup.remove(); };
    active = entry;
    popup.addTo(map);
    const dialog = popup.getElement();
    dialog?.setAttribute("role", "dialog");
    dialog?.setAttribute("aria-label", `${entry.capital.name}, ${entry.capital.country}: marker color`);
    dialog?.addEventListener("keydown", escape);
    entry.button.setAttribute("aria-expanded", "true");
    entry.button.setAttribute("aria-pressed", "true");
    entry.focusColor = () => buttons[markerColors.findIndex((color) => color.value === entry.color)].focus({ preventScroll: true });
    entry.focusColor();
  }

  function remove(entry: Entry, focusCanvas = true) {
    const focusInsidePopup = entry.popup?.getElement()?.contains(document.activeElement);
    entry.disposePopup?.(false, false);
    entry.button.removeEventListener("click", entry.open);
    entry.marker.remove();
    if (focusCanvas && focusInsidePopup) map.getCanvas().focus({ preventScroll: true });
  }

  return {
    setContinent(value: ContinentFilter) {
      continent = value;
      for (const entry of entries.values()) updateVisibility(entry);
    },
    reset() {
      map.stop();
      active?.disposePopup?.(false, false);
      for (const entry of entries.values()) {
        entry.color = markerColors[0].value;
        entry.button.style.backgroundColor = entry.color;
      }
    },
    select(id: number | null, fromList = false) {
      if (id === null) { active?.disposePopup?.(false, false); return; }
      const entry = entries.get(id);
      if (!entry?.visible) return;
      open(entry);
      if (fromList) {
        navigate(entry);
        // Repeated list activation still transfers focus into the existing popup.
        entry.focusColor?.();
      }
    },
    update(capitals: Capital[]) {
      const valid = capitals.filter((capital) => Number.isFinite(capital.latitude)
        && Math.abs(capital.latitude) <= 90 && Number.isFinite(capital.longitude)
        && Math.abs(capital.longitude) <= 180);
      const ids = new Set(valid.map((capital) => capital.id));
      for (const [id, entry] of entries) {
        if (ids.has(id)) continue;
        const selected = active === entry;
        remove(entry);
        entries.delete(id);
        if (selected) onSelectionChange(null, entry.capital.id);
      }
      for (const capital of valid) {
        let entry = entries.get(capital.id);
        if (!entry) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "capital-marker";
          button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false"><path d="M19 10c0 5-7 11-7 11S5 15 5 10a7 7 0 1 1 14 0Z"/><circle cx="12" cy="10" r="2.5"/></svg>';
          button.setAttribute("aria-haspopup", "dialog");
          button.setAttribute("aria-expanded", "false");
          button.setAttribute("aria-pressed", "false");
          const color = readMarkerColor(capital.id);
          button.style.backgroundColor = color;
          const marker = new api.Marker({ element: button, anchor: "center" })
            .setLngLat([capital.longitude, capital.latitude]).addTo(map);
          // Mapbox assigns role="img" even to custom elements.
          button.setAttribute("role", "button");
          const created: Entry = {
            capital, marker, button, color, visible: true,
            open: (event) => {
              event.stopPropagation();
              if (!created.visible) return;
              open(created);
              onSelectionChange(created.capital.id);
              // Keep edge popups in the map without changing the user's zoom.
              fitPopup(created);
            },
          };
          button.addEventListener("click", created.open);
          entries.set(capital.id, created);
          entry = created;
        }
        const moved = entry.capital.latitude !== capital.latitude || entry.capital.longitude !== capital.longitude;
        if (entry.flag && entry.capital.flagCode !== capital.flagCode) updateCountryFlag(entry.flag, capital.flagCode);
        entry.capital = capital;
        updateVisibility(entry);
        entry.button.setAttribute("aria-label", `${capital.name}, ${capital.country}: change marker color`);
        entry.marker.setLngLat([capital.longitude, capital.latitude]);
        entry.popup?.setLngLat([capital.longitude, capital.latitude]);
        entry.popup?.getElement()?.setAttribute("aria-label", `${capital.name}, ${capital.country}: marker color`);
        if (entry.heading) entry.heading.textContent = capital.name;
        if (entry.country) entry.country.textContent = capital.country;
        if (entry.facts) updateFacts(entry.facts, capital);
        entry.actions?.setAttribute("aria-label", `Map actions for ${capital.name}`);
        if (entry.coordinates) {
          entry.coordinates.textContent = coordinates(capital);
          entry.coordinates.setAttribute("aria-label", `Latitude ${capital.latitude}, longitude ${capital.longitude}`);
        }
        if (active === entry && moved) navigate(entry);
      }
    },
    resize() { if (active) fitPopup(active); },
    destroy() {
      for (const entry of entries.values()) remove(entry, false);
      entries.clear();
    },
  };
}
