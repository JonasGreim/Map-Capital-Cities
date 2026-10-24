import mapboxgl from "mapbox-gl";
import type { Capital } from "./api";

export const markerColors = [
  { name: "Teal", value: "#216278" },
  { name: "Red", value: "#b42318" },
  { name: "Purple", value: "#6941c6" },
  { name: "Gold", value: "#946200" },
] as const;

type Entry = {
  capital: Capital;
  marker: mapboxgl.Marker;
  button: HTMLButtonElement;
  color: string;
  popup?: mapboxgl.Popup;
  heading?: HTMLHeadingElement;
  country?: HTMLParagraphElement;
  disposePopup?: () => void;
  open: (event: Event) => void;
};

// Each ID owns its marker and in-memory color for as long as it is in the data.
export function createCapitalMarkers(map: mapboxgl.Map, api = mapboxgl) {
  const entries = new globalThis.Map<number, Entry>();
  let active: Entry | undefined;

  function close(entry: Entry) {
    entry.disposePopup?.();
  }

  function open(entry: Entry) {
    if (entry.popup) return;
    if (active) close(active);
    const content = document.createElement("div");
    content.className = "capital-popup";
    const heading = document.createElement("h2");
    heading.textContent = entry.capital.name;
    const country = document.createElement("p");
    country.textContent = entry.capital.country;
    const label = document.createElement("label");
    label.textContent = "Marker color";
    const select = document.createElement("select");
    for (const color of markerColors) {
      const option = document.createElement("option");
      option.value = color.value;
      option.textContent = color.name;
      select.append(option);
    }
    select.value = entry.color;
    label.append(select);
    content.append(heading, country, label);
    const popup = new api.Popup({ offset: 20, maxWidth: "260px", focusAfterOpen: false })
      .setLngLat([entry.capital.longitude, entry.capital.latitude])
      .setDOMContent(content);
    const change = () => {
      if (!markerColors.some((color) => color.value === select.value)) return;
      entry.color = select.value;
      entry.button.style.backgroundColor = entry.color;
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.stopPropagation();
      popup.remove();
    };
    const onClose = () => {
      // Mapbox detaches the dialog before emitting close, which can move focus
      // to body. Respect focus already moved to another control or the canvas.
      const restoreFocus = dialog?.contains(document.activeElement) || document.activeElement === document.body;
      select.removeEventListener("change", change);
      dialog?.removeEventListener("keydown", escape);
      popup.off("close", onClose);
      entry.popup = undefined;
      entry.heading = undefined;
      entry.country = undefined;
      entry.disposePopup = undefined;
      entry.button.setAttribute("aria-expanded", "false");
      if (active === entry) active = undefined;
      if (restoreFocus && entry.button.isConnected) entry.button.focus({ preventScroll: true });
    };
    select.addEventListener("change", change);
    popup.on("close", onClose);
    entry.popup = popup;
    entry.heading = heading;
    entry.country = country;
    entry.disposePopup = () => { popup.remove(); };
    active = entry;
    popup.addTo(map);
    const dialog = popup.getElement();
    dialog?.setAttribute("role", "dialog");
    dialog?.setAttribute("aria-label", `${entry.capital.name}, ${entry.capital.country}: marker color`);
    dialog?.addEventListener("keydown", escape);
    entry.button.setAttribute("aria-expanded", "true");
    select.focus({ preventScroll: true });
  }

  function remove(entry: Entry) {
    close(entry);
    entry.button.removeEventListener("click", entry.open);
    entry.marker.remove();
  }

  return {
    update(capitals: Capital[]) {
      const valid = capitals.filter((capital) => Number.isFinite(capital.latitude)
        && Math.abs(capital.latitude) <= 90 && Number.isFinite(capital.longitude)
        && Math.abs(capital.longitude) <= 180);
      const ids = new Set(valid.map((capital) => capital.id));
      for (const [id, entry] of entries) {
        if (ids.has(id)) continue;
        remove(entry);
        entries.delete(id);
      }
      for (const capital of valid) {
        let entry = entries.get(capital.id);
        if (!entry) {
          const button = document.createElement("button");
          button.type = "button";
          button.className = "capital-marker";
          button.setAttribute("aria-haspopup", "dialog");
          button.setAttribute("aria-expanded", "false");
          button.style.backgroundColor = markerColors[0].value;
          const marker = new api.Marker({ element: button, anchor: "center" })
            .setLngLat([capital.longitude, capital.latitude]).addTo(map);
          // Mapbox assigns role="img" even to custom elements.
          button.setAttribute("role", "button");
          const created: Entry = {
            capital, marker, button, color: markerColors[0].value,
            open: (event) => {
              // Do not let the opening click reach Mapbox's close-on-map-click listener.
              event.stopPropagation();
              open(created);
            },
          };
          button.addEventListener("click", created.open);
          entries.set(capital.id, created);
          entry = created;
        }
        entry.capital = capital;
        entry.button.setAttribute("aria-label", `${capital.name}, ${capital.country}: change marker color`);
        entry.marker.setLngLat([capital.longitude, capital.latitude]);
        entry.popup?.setLngLat([capital.longitude, capital.latitude]);
        entry.popup?.getElement()?.setAttribute("aria-label", `${capital.name}, ${capital.country}: marker color`);
        if (entry.heading) entry.heading.textContent = capital.name;
        if (entry.country) entry.country.textContent = capital.country;
      }
    },
    destroy() {
      for (const entry of entries.values()) remove(entry);
      entries.clear();
    },
  };
}
