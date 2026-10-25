import type { Pool } from "pg";
import { readPopulation, readCurrencies, type CountryCurrency } from "./country-facts.js";

const endpoint = "https://api.restcountries.com/countries/v5";
const limit = 100;
const maxPages = 100;

type Capital = { name: string; latitude: number; longitude: number; country: string };
export type ImportStats = {
  pages: number;
  fetched: number;
  skippedInvalid: number;
  skippedExisting: number;
  inserted: number;
};

export class ImportError extends Error {
  constructor(message: string, readonly stats: ImportStats) {
    super(message);
    this.name = "ImportError";
  }
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function nonempty(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0 && !value.includes("\0");
}

export type CountryMetadata = {
  flagCode: string | null;
  continents: string[] | null;
  population: number | null;
  currencies: CountryCurrency[] | null;
};
export type CountryMetadataLookup = ReadonlyMap<string, CountryMetadata>;

// Verified v5 continents values; North and South America stay separate.
const continentNames = ["Africa", "Antarctica", "Asia", "Europe", "North America", "Oceania", "South America"];
function normalizeContinents(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0) return null;
  const names = value.map(item => typeof item === "string"
    ? continentNames.find(name => name.toLowerCase() === item.trim().toLowerCase()) : undefined);
  if (names.some(name => name === undefined)) return null;
  return continentNames.filter(name => names.includes(name));
}

const countryKey = (name: string) => name.trim().toLowerCase();

export function countryMetadata(metadata: CountryMetadataLookup, country: string): CountryMetadata {
  return metadata.get(countryKey(country)) ?? { flagCode: null, continents: null, population: null, currencies: null };
}

function collectMetadata(metadata: Map<string, CountryMetadata>, record: unknown) {
  if (!object(record) || !object(record.names) || !nonempty(record.names.common)) return;
  const name = countryKey(record.names.common);
  const flagCode = object(record.codes) && typeof record.codes.alpha_2 === "string"
    && record.codes.alpha_2.length === 2 && /^[A-Z]{2}$/.test(record.codes.alpha_2) ? record.codes.alpha_2 : null;
  const continents = normalizeContinents(record.continents);
  const population = readPopulation(record.population);
  const currencies = readCurrencies(record.currencies);
  const previous = metadata.get(name);
  // Each field fails closed independently; ambiguity remains sticky across pages.
  metadata.set(name, {
    flagCode: previous && previous.flagCode !== flagCode ? null : flagCode,
    continents: previous && JSON.stringify(previous.continents) !== JSON.stringify(continents) ? null : continents,
    population: previous && previous.population !== population ? null : population,
    currencies: previous && JSON.stringify(previous.currencies) !== JSON.stringify(currencies) ? null : currencies,
  });
}

function capitalFrom(value: unknown): Capital | undefined {
  if (!object(value) || !object(value.names) || !nonempty(value.names.common)
    || !Array.isArray(value.capitals)) return;
  const capital: unknown = value.capitals[0];
  if (!object(capital) || !nonempty(capital.name) || !object(capital.coordinates)) return;
  const { lat, lng } = capital.coordinates;
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90
    || typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) return;
  return { name: capital.name.trim(), country: value.names.common.trim(), latitude: lat, longitude: lng };
}

// Policy belongs to the caller: this importer can also serve a future seed-once startup.
export async function importCapitals(
  database: Pick<Pool, "connect">,
  apiKey: string | undefined,
  fetchPage: typeof fetch = fetch,
): Promise<ImportStats & { metadata: CountryMetadataLookup }> {
  const stats: ImportStats = { pages: 0, fetched: 0, skippedInvalid: 0, skippedExisting: 0, inserted: 0 };
  function fail(message: string): never { throw new ImportError(message, { ...stats }); }
  if (!apiKey?.trim()) fail("RESTCOUNTRIES_API_KEY is required; import not started");

  const capitals: Capital[] = [];
  const metadata = new Map<string, CountryMetadata>();
  const seenPages = new Set<string>();
  let offset = 0;
  let expectedTotal: number | undefined;
  let metadataUsed: boolean | undefined;

  for (;;) {
    if (stats.pages === maxPages) fail(`REST Countries exceeded ${maxPages} pages; import incomplete`);
    const url = new URL(endpoint);
    url.searchParams.set("limit", String(limit));
    url.searchParams.set("offset", String(offset));
    let response: Response;
    try {
      response = await fetchPage(url, {
        headers: { Authorization: `Bearer ${apiKey.trim()}` },
        signal: AbortSignal.timeout(15_000),
        redirect: "error",
      });
    } catch {
      fail(`REST Countries request failed at offset ${offset} (network/timeout); import incomplete`);
    }
    if (!response.ok) fail(`REST Countries HTTP ${response.status} at offset ${offset}; import incomplete`);
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      fail(`REST Countries invalid JSON at offset ${offset}; import incomplete`);
    }
    if (!object(body) || body.errors !== undefined || !object(body.data)
      || !Array.isArray(body.data.objects) || body.data._demo !== undefined) {
      fail(`REST Countries invalid response at offset ${offset}; import incomplete`);
    }
    // The envelope is validated separately from individual (possibly malformed) records.
    const data = body.data;
    const objects = data.objects as unknown[];
    if (objects.length > limit) fail(`REST Countries oversized page at offset ${offset}`);
    const hasMetadata = data.meta !== undefined;
    metadataUsed ??= hasMetadata;
    if (metadataUsed !== hasMetadata) fail(`REST Countries pagination metadata disappeared/changed at offset ${offset}`);
    let more = objects.length === limit;
    if (hasMetadata) {
      const meta = data.meta;
      if (!object(meta) || !Number.isSafeInteger(meta.total) || (meta.total as number) < 0
        || meta.count !== objects.length || meta.limit !== limit || meta.offset !== offset
        || typeof meta.more !== "boolean") fail(`REST Countries invalid pagination at offset ${offset}`);
      const pagination = meta as { total: number; more: boolean };
      expectedTotal ??= pagination.total;
      if (pagination.total !== expectedTotal || offset + objects.length > expectedTotal
        || pagination.more !== (offset + objects.length < expectedTotal)
        || (pagination.more && objects.length === 0)) {
        fail(`REST Countries inconsistent pagination at offset ${offset}; import incomplete`);
      }
      more = pagination.more;
    }
    if (objects.length > 0) {
      const fingerprint = JSON.stringify(objects);
      if (seenPages.has(fingerprint)) fail(`REST Countries repeated page at offset ${offset}; import incomplete`);
      seenPages.add(fingerprint);
    }
    stats.pages++;
    stats.fetched += objects.length;
    for (const record of objects) {
      collectMetadata(metadata, record);
      const capital = capitalFrom(record);
      if (capital) capitals.push(capital);
      else stats.skippedInvalid++;
    }
    offset += objects.length;
    if (!more) break;
  }

  // Fetch everything first, then commit all inserts together. No partial import on failure.
  let client;
  try {
    client = await database.connect();
  } catch {
    fail("PostgreSQL connection failed; no capitals imported");
  }
  let inserted = 0;
  let transactionFailed = false;
  try {
    await client.query("BEGIN");
    for (const capital of capitals) {
      const result = await client.query(
        "INSERT INTO capitals (name, latitude, longitude, country) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING",
        [capital.name, capital.latitude, capital.longitude, capital.country],
      );
      inserted += result.rowCount ?? 0;
    }
    await client.query("COMMIT");
  } catch {
    transactionFailed = true;
    try { await client.query("ROLLBACK"); } catch { /* Preserve the original failure. */ }
    fail("PostgreSQL import transaction failed; import not successful (check db/schema.sql initialization)");
  } finally {
    client.release(transactionFailed);
  }
  stats.inserted = inserted;
  stats.skippedExisting = capitals.length - inserted;
  // Metadata becomes available to the caller only after every page and COMMIT succeed.
  return { ...stats, metadata };
}
