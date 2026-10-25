import mapboxgl from "mapbox-gl";
import { useEffect, useRef, useState } from "react";
import { useCapitalStore } from "./capital-store";
import { createCapitalMarkers } from "./capital-markers";
import { useCapitalActions } from "./CapitalActions";

const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export function Map() {
  const { toggleActions, closeActions } = useCapitalActions();
  const el = useRef<HTMLDivElement>(null);
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
    };
    const contextLost = () => setMapError(true);
    const contextRestored = () => setMapError(false);
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
    const observer = new ResizeObserver(() => { map.resize(); capitalMarkers.resize(); });
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      map.off("error", failed);
      map.off("style.load", styled);
      map.off("webglcontextlost", contextLost);
      map.off("webglcontextrestored", contextRestored);
      capitalMarkers.destroy();
      markers.current = undefined;
      map.remove();
    };
  }, [toggleActions, closeActions]);

  useEffect(() => { markers.current?.setContinent(continent); }, [continent]);
  useEffect(() => {
    if (appliedReset.current !== resetVersion) {
      markers.current?.reset();
      appliedReset.current = resetVersion;
    }
    markers.current?.update(capitals);
  }, [capitals, resetVersion]);
  useEffect(() => {
    const state = useCapitalStore.getState();
    markers.current?.select(state.selectedCapitalId, state.selectionSource === "list");
    if (token && state.selectedCapitalId !== null && state.selectionSource === "list") {
      el.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }, [selectionVersion, selectedCapitalId]);

  if (!token) return <div className="map map-unavailable" role="status">Map unavailable. Set VITE_MAPBOX_TOKEN in the root .env and restart the frontend.</div>;
  return <><div className="map" ref={el} />{(mapError || resourceError) && <p className="map-error" role="status">
    {mapError
      ? "Map could not load. Check your Mapbox token and connection. The capital list is still available."
      : "Map resources could not load. Check your Mapbox token and connection. The capital list is still available."}
  </p>}</>;
}
