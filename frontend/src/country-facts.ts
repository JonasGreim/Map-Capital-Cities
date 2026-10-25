import { readContinents } from "./continent-filter";

export type CountryCurrency = { code: string; name?: string };

export function readPopulation(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

export function readCurrencies(value: unknown): CountryCurrency[] | null {
  if (!Array.isArray(value)) return null;
  const currencies = new Map<string, CountryCurrency | null>();
  for (const item of value) {
    if (typeof item !== "object" || item === null || Array.isArray(item)
      || typeof item.code !== "string" || item.code.length !== 3 || !/^[A-Z]{3}$/.test(item.code)) continue;
    // Names are optional; reject controls, formatting characters and markup.
    const name = typeof item.name === "string" && !/[\p{Cc}\p{Cf}<>]/u.test(item.name)
      ? item.name.trim() : "";
    const currency = { code: item.code, ...(name ? { name } : {}) };
    const previous = currencies.get(item.code);
    // A contradictory name never selects an arbitrary duplicate, even later.
    currencies.set(item.code, previous === null || (previous && previous.name !== currency.name) ? null : currency);
  }
  const result = [...currencies.values()].filter((item): item is CountryCurrency => item !== null)
    .sort((a, b) => a.code.localeCompare(b.code));
  return result.length ? result : null;
}

const populationFormat = new Intl.NumberFormat("en-US");

export function countryFacts(capital: { continents?: unknown; population?: unknown; currencies?: unknown }) {
  const population = readPopulation(capital.population);
  return [
    ["Continent", readContinents(capital.continents)?.join(", ") ?? "—"],
    ["Country population", population === null ? "—" : populationFormat.format(population)],
    ["Currency", readCurrencies(capital.currencies)?.map(currency => currency.name
      ? `${currency.name} (${currency.code})` : currency.code).join(", ") ?? "—"],
  ];
}
