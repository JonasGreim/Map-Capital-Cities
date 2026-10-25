import { readFileSync } from "node:fs";
import type { CapitalInput } from "./capitals.js";

// Reviewed source data, independent of subsequent REST Countries responses.
const snapshot: unknown = JSON.parse(readFileSync(new URL("../../db/default-capitals.json", import.meta.url), "utf8"));

export function validateDefaults(value: unknown): readonly CapitalInput[] {
  if (!Array.isArray(value) || value.length === 0) throw new Error("Invalid default capital snapshot");
  const names = new Set<string>();
  const countries = new Set<string>();
  return Object.freeze(value.map((row: unknown) => {
    if (typeof row !== "object" || row === null) throw new Error("Invalid default capital snapshot");
    const capital = row as Record<string, unknown>;
    const { name, country, latitude, longitude } = capital;
    if (Object.keys(capital).sort().join(",") !== "country,latitude,longitude,name"
      || typeof name !== "string" || !name.trim() || name !== name.trim() || name.includes("\0")
      || typeof country !== "string" || !country.trim() || country !== country.trim() || country.includes("\0")
      || typeof latitude !== "number" || !Number.isFinite(latitude) || Math.abs(latitude) > 90
      || typeof longitude !== "number" || !Number.isFinite(longitude) || Math.abs(longitude) > 180
      || names.has(name.toLowerCase()) || countries.has(country)) throw new Error("Invalid default capital snapshot");
    names.add(name.toLowerCase());
    countries.add(country);
    return Object.freeze({ name, country, latitude, longitude });
  }));
}

if (typeof snapshot !== "object" || snapshot === null || !("version" in snapshot) || snapshot.version !== "default-v1"
  || !("capitals" in snapshot)) throw new Error("Invalid default capital snapshot");

export const defaultVersion = snapshot.version;
export const defaultCapitals = validateDefaults(snapshot.capitals);
