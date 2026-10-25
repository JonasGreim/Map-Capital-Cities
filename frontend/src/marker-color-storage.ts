import { markerColors } from "./marker-colors";

export const markerColorStorageKey = "map-capital-cities.marker-colors.v1";

const validId = (id: number) => Number.isInteger(id) && id > 0 && id <= 2147483647;
const validColor = (color: unknown): color is string => markerColors.some(value => value.value === color);

// Stateless persistence only: live colors remain owned by the marker entries.
// All callers guard even access to the native storage getter (SecurityError).
function readOverrides(storage: Storage): Record<string, string> {
  const overrides: Record<string, string> = {};
  const raw = storage.getItem(markerColorStorageKey);
  let data: unknown;
  try { data = raw === null ? null : JSON.parse(raw); } catch { return overrides; }
  if (!data || typeof data !== "object" || Array.isArray(data)) return overrides;
  for (const [id, color] of Object.entries(data)) {
    if (validId(Number(id)) && String(Number(id)) === id && validColor(color) && color !== markerColors[0].value) {
      overrides[id] = color;
    }
  }
  return overrides;
}

export function readMarkerColor(id: number): string {
  try {
    if (validId(id)) return readOverrides(globalThis.localStorage)[id] ?? markerColors[0].value;
  } catch { /* Storage is optional; keep the marker usable in memory. */ }
  return markerColors[0].value;
}

export function saveMarkerColor(id: number, color: string): void {
  if (!validId(id) || !validColor(color)) return;
  try {
    const storage = globalThis.localStorage;
    const overrides = readOverrides(storage);
    if (color === markerColors[0].value) delete overrides[id];
    else overrides[id] = color;
    if (Object.keys(overrides).length) storage.setItem(markerColorStorageKey, JSON.stringify(overrides));
    else storage.removeItem(markerColorStorageKey);
  } catch { /* Failed reads/writes must never block color changes or CRUD. */ }
}

export function removeMarkerColor(id: number): void {
  saveMarkerColor(id, markerColors[0].value);
}

export function clearMarkerColors(): void {
  try { globalThis.localStorage.removeItem(markerColorStorageKey); }
  catch { /* The confirmed server result still takes effect in memory. */ }
}
