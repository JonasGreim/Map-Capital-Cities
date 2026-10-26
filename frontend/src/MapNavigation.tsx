import type { Map as MapboxMap } from "mapbox-gl";
import { useCallback, useEffect, useRef, useSyncExternalStore } from "react";

export const DEFAULT_MAP_CAMERA = {
  center: [10, 30] as [number, number], zoom: 1.5, bearing: 0, pitch: 0,
};

export function MapNavigation({ map, disabled, picking }: {
  map?: MapboxMap; disabled: boolean; picking: boolean;
}) {
  const pendingZoom = useRef<number>();
  const subscribe = useCallback((notify: () => void) => {
    if (!map) return () => {};
    map.on("zoom", notify);
    return () => { map.off("zoom", notify); };
  }, [map]);
  // Re-render only when a zoom limit changes, rather than on every camera frame.
  const limits = useSyncExternalStore(subscribe, () => map
    ? `${map.getZoom() >= map.getMaxZoom()}:${map.getZoom() <= map.getMinZoom()}` : "true:true", () => "true:true");
  const [atMax, atMin] = limits.split(":").map(value => value === "true");
  useEffect(() => {
    const finished = () => { pendingZoom.current = undefined; };
    map?.on("zoomend", finished);
    return () => { map?.off("zoomend", finished); finished(); };
  }, [map]);
  const unavailable = disabled || picking || !map;
  const duration = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 250;
  const zoom = (step: number) => {
    if (unavailable) return;
    // Retain the destination across rapid clicks during a transition. stop()
    // emits zoomend, so capture the next step before stopping the old animation.
    const target = Math.max(map.getMinZoom(), Math.min(map.getMaxZoom(), (pendingZoom.current ?? map.getZoom()) + step));
    map.stop();
    pendingZoom.current = target;
    map.zoomTo(target, { duration: duration() });
  };
  const reset = () => {
    if (unavailable) return;
    map.stop();
    pendingZoom.current = undefined;
    const time = duration();
    if (time === 0) map.jumpTo(DEFAULT_MAP_CAMERA);
    else map.easeTo({ ...DEFAULT_MAP_CAMERA, duration: time });
  };

  return <div className="map-navigation" role="group" aria-label="Map navigation" hidden={picking}>
    <div className="map-zoom-group">
      <button type="button" aria-label="Zoom in" title="Zoom in" disabled={unavailable || atMax} onClick={() => zoom(1)}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14M12 5v14" /></svg>
      </button>
      <button type="button" aria-label="Zoom out" title="Zoom out" disabled={unavailable || atMin} onClick={() => zoom(-1)}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14" /></svg>
      </button>
    </div>
    <button type="button" className="map-view-reset" aria-label="Reset map view" title="Reset map view" disabled={unavailable} onClick={reset}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="12" cy="12" r="7" /><circle cx="12" cy="12" r="2" /><path d="M12 2v5m0 10v5M2 12h5m10 0h5" /></svg>
    </button>
  </div>;
}
