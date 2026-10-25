import type mapboxgl from "mapbox-gl";

export type PickedCoordinates = { latitude: string; longitude: string };

export function formatPickedCoordinates(latitude: number, longitude: number): PickedCoordinates | null {
  if (!Number.isFinite(latitude) || Math.abs(latitude) > 90
    || !Number.isFinite(longitude) || Math.abs(longitude) > 180) return null;
  return { latitude: latitude.toFixed(6), longitude: longitude.toFixed(6) };
}

// Mapbox suppresses click after a drag. Accept only its canvas, never markers,
// popup actions or controls. This listener exists only during an explicit pick.
export function listenForCoordinates(map: mapboxgl.Map, onPick: (coordinates: PickedCoordinates) => void) {
  const canvas = map.getCanvas();
  const cursor = canvas.style.cursor;
  canvas.style.cursor = "crosshair";
  let finished = false;
  const click = (event: mapboxgl.MapMouseEvent) => {
    if (finished || event.originalEvent.target !== canvas) return;
    const coordinates = formatPickedCoordinates(event.lngLat.lat, event.lngLat.lng);
    if (!coordinates) return;
    finished = true;
    onPick(coordinates);
  };
  map.on("click", click);
  return () => {
    finished = true;
    map.off("click", click);
    canvas.style.cursor = cursor;
  };
}
