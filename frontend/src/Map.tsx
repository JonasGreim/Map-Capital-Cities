import mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";
import { useCapitalStore } from "./capital-store";
import { createCapitalMarkers } from "./capital-markers";

const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export function Map() {
  const el = useRef<HTMLDivElement>(null);
  const markers = useRef<ReturnType<typeof createCapitalMarkers>>();
  const capitals = useCapitalStore((state) => state.capitals);

  useEffect(() => {
    if (!token || !el.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({ container: el.current, style: "mapbox://styles/mapbox/streets-v12", center: [10, 30], zoom: 1.5 });
    const capitalMarkers = createCapitalMarkers(map);
    markers.current = capitalMarkers;
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el.current);
    return () => {
      observer.disconnect();
      capitalMarkers.destroy();
      markers.current = undefined;
      map.remove();
    };
  }, []);

  useEffect(() => { markers.current?.update(capitals); }, [capitals]);

  if (!token) return <div className="map map-unavailable" role="status">Map unavailable. Set VITE_MAPBOX_TOKEN in the root .env and restart the frontend.</div>;
  return <div className="map" ref={el} />;
}
