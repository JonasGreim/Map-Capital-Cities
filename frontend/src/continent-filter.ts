import type { Capital } from "./api";

export const continentNames = ["Africa", "Antarctica", "Asia", "Europe", "North America", "Oceania", "South America"] as const;
export type Continent = typeof continentNames[number];
export type ContinentFilter = Continent | "";

export function readContinents(value: unknown): Continent[] | null {
  if (!Array.isArray(value) || !value.length) return null;
  const names = value.map(item => typeof item === "string"
    ? continentNames.find(name => name.toLowerCase() === item.trim().toLowerCase()) : undefined);
  if (names.some(name => name === undefined)) return null;
  return continentNames.filter(name => names.includes(name));
}

export function matchesContinent(capital: Capital, continent: ContinentFilter) {
  return continent === "" || (Array.isArray(capital.continents) && capital.continents.includes(continent));
}
