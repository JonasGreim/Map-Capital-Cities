import mapboxgl from "mapbox-gl";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { useCapitalStore } from "./capital-store";
import { createCapitalMarkers } from "./capital-markers";
import { useCapitalActions } from "./CapitalActions";
import { listenForCoordinates } from "./coordinate-picker";

const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export function Map({ active = true }: { active?: boolean }) {
  const visible = useRef(active);
  useLayoutEffect(() => { visible.current = active; }, [active]);
  const appliedSelection = useRef(-1);
  const { toggleActions, closeActions, picking, preview, setMapAvailable, finishPick, cancelPick } = useCapitalActions();
  const el = useRef<HTMLDivElement>(null);
  const mapRef = useRef<mapboxgl.Map>();
  const cancelButton = useRef<HTMLButtonElement>(null);
  const [mapError, setMapError] = useState(false);
  const [resourceError, setResourceError] = useState(false);
  const markers = useRef<ReturnType<typeof createCapitalMarkers>>();
  const continent = useCapitalStore((state) => state.continent);
  const capitals = useCapitalStore((state) => state.capitals);
  const selectionVersion = useCapitalStore((state) => state.selectionVersion);
  const selectedCapitalId = useCapitalStore((state) => state.selectedCapitalId);
  const resetVersion = useCapitalStore((state) => state.resetVersion);
  const appliedReset = useRef(resetVersion);

  useEffect(() => {
    if (!token || !el.current) return;
    mapboxgl.accessToken = token;
    let map: mapboxgl.Map;
    try {
      map = new mapboxgl.Map({ container: el.current, style: "mapbox://styles/mapbox/streets-v12", center: [10, 30], zoom: 1.5 });
    } catch {
      // Report an external WebGL/Mapbox construction failure without taking
      // down the independent sidebar.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setMapError(true);
      return;
    }
    mapRef.current = map;
    // Generic errors have no fatality signal (tiles, sprites, requests, etc.).
    // Before the initial style is ready, offer neutral setup feedback; after
    // that, do not infer whole-map unavailability from resource errors.
    let styleReady = false;
    const failed = () => {
      if (!styleReady) setResourceError(true);
    };
    const styled = () => {
      styleReady = true;
      setResourceError(false);
      setMapAvailable(true);
    };
    const contextLost = () => { setMapError(true); setMapAvailable(false); };
    const contextRestored = () => { setMapError(false); setMapAvailable(styleReady); };
    map.on("error", failed);
    map.on("style.load", styled);
    map.on("webglcontextlost", contextLost);
    map.on("webglcontextrestored", contextRestored);
    const capitalMarkers = createCapitalMarkers(map, mapboxgl, (id, closedId) => {
      const state = useCapitalStore.getState();
      // A closing/deleted popup must not clear a newer, batched list selection.
      if (id === null && state.selectedCapitalId !== closedId) return;
      state.selectCapital(id, "map");
    }, { onOpen: toggleActions, onClose: closeActions });
    markers.current = capitalMarkers;
    const observer = new ResizeObserver(() => {
      if (!visible.current || !el.current?.clientWidth || !el.current.clientHeight) return;
      map.resize(); capitalMarkers.resize();
    });
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      map.off("error", failed);
      map.off("style.load", styled);
      map.off("webglcontextlost", contextLost);
      map.off("webglcontextrestored", contextRestored);
      capitalMarkers.destroy();
      markers.current = undefined;
      mapRef.current = undefined;
      setMapAvailable(false);
      map.remove();
    };
  }, [toggleActions, closeActions, setMapAvailable]);

  useEffect(() => { markers.current?.setContinent(continent); }, [continent]);
  useEffect(() => {
    if (appliedReset.current !== resetVersion) {
      markers.current?.reset();
      appliedReset.current = resetVersion;
    }
    markers.current?.update(capitals);
  }, [capitals, resetVersion]);
  useEffect(() => {
    const map = mapRef.current;
    const state = useCapitalStore.getState();
    if (!active) return;
    if (!map) {
      if (state.selectedCapitalId !== null && state.selectionSource === "list" && appliedSelection.current !== state.selectionVersion) {
        appliedSelection.current = state.selectionVersion;
        document.getElementById("world-map")?.focus({ preventScroll: true });
      }
      return;
    }
    if (!el.current?.clientWidth || !el.current.clientHeight) return;
    // React has committed the visible panel. Resize the existing instance before
    // consuming a selection; hidden tabs leave the version pending.
    map.resize();
    if (appliedSelection.current !== state.selectionVersion) {
      appliedSelection.current = state.selectionVersion;
      markers.current?.select(state.selectedCapitalId, state.selectionSource === "list");
    } else markers.current?.resize();
  }, [active, selectionVersion, selectedCapitalId]);

  useEffect(() => {
    const map = mapRef.current;
    if (!active || !map || !picking) return;
    // End an existing camera flight without starting another one.
    map.stop();
    markers.current?.setPicking(true);
    const dispose = listenForCoordinates(map, finishPick);
    const escape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      event.stopPropagation();
      cancelPick();
    };
    document.addEventListener("keydown", escape, true);
    // Wait until the form effect has removed the native modal layer.
    const frame = requestAnimationFrame(() => {
      cancelButton.current?.focus();
      cancelButton.current?.scrollIntoView({ block: "nearest" });
    });
    return () => {
      cancelAnimationFrame(frame);
      dispose();
      document.removeEventListener("keydown", escape, true);
      markers.current?.setPicking(false);
      // Restore the existing selection without a list-triggered flyTo.
      if (visible.current) markers.current?.select(useCapitalStore.getState().selectedCapitalId);
    };
  }, [active, picking, finishPick, cancelPick]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !preview) return;
    const element = document.createElement("div");
    element.className = "coordinate-preview";
    element.setAttribute("role", "img");
    element.setAttribute("aria-label", "Temporary coordinate preview");
    const marker = new mapboxgl.Marker({ element, anchor: "center" })
      .setLngLat([Number(preview.longitude), Number(preview.latitude)]).addTo(map);
    return () => { marker.remove(); };
  }, [preview]);

  if (!token) return <div className="map map-unavailable" role="status">Map unavailable. Set VITE_MAPBOX_TOKEN in the root .env and restart the frontend.</div>;
  return <><div className="map" ref={el} />
    {picking && <div className="coordinate-pick-banner">
      <div role="status"><strong>Pick coordinates</strong><p>Click on the map to choose a location. Escape cancels.</p></div>
      <button ref={cancelButton} type="button" className="secondary" onClick={cancelPick}>Cancel</button>
    </div>}
    {(mapError || resourceError) && <p className="map-error" role="status">
    {mapError
      ? "Map could not load. Check your Mapbox token and connection. The capital list is still available."
      : "Map resources could not load. Check your Mapbox token and connection. The capital list is still available."}
  </p>}</>;
}
