import mapboxgl from "mapbox-gl";
import { useEffect, useRef } from "react";

const token = import.meta.env.VITE_MAPBOX_TOKEN as string | undefined;

export function Map() {
  const el = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!token || !el.current) return;
    mapboxgl.accessToken = token;
    const map = new mapboxgl.Map({ container: el.current, style: "mapbox://styles/mapbox/streets-v12", center: [10, 30], zoom: 1.5 });
    const observer = new ResizeObserver(() => map.resize());
    observer.observe(el.current);
    return () => { observer.disconnect(); map.remove(); };
  }, []);

  if (!token) return <div className="map map-unavailable" role="status">Map unavailable. Set VITE_MAPBOX_TOKEN in the root .env and restart the frontend.</div>;
  return <div className="map" ref={el} />;
}
