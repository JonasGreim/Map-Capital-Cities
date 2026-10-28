import { readFile } from "node:fs/promises";
import type { Pool, PoolClient } from "pg";
import {
  fetchCapitalData, insertCapitals, ImportError,
  type CountryMetadata, type CountryMetadataLookup, type ImportStats,
} from "./import-capitals.js";

const source = "rest-countries-v5";
// Database-wide transaction lock: also serializes schema creation on managed PG.
const initializationLock = 694219;

async function completed(client: PoolClient) {
  // A catalog scan establishes a fresh snapshot after waiting for transactional DDL.
  const { rows: [table] } = await client.query<{ present: boolean }>(`
    SELECT EXISTS (SELECT 1 FROM pg_tables
      WHERE schemaname = current_schema() AND tablename = 'import_state') AS present
  `);
  if (!table.present) return false;
  return (await client.query("SELECT 1 FROM import_state WHERE source = $1", [source])).rowCount === 1;
}

async function loadMetadata(client: PoolClient): Promise<CountryMetadataLookup> {
  const { rows } = await client.query<CountryMetadata & { countryKey: string }>(`
    SELECT country_key AS "countryKey", flag_code AS "flagCode", continents,
           population::double precision AS population, currencies
    FROM country_metadata
  `);
  return new Map(rows.map(({ countryKey, ...facts }) => [countryKey, facts]));
}

export async function initializeDatabase(
  database: Pick<Pool, "connect">,
  apiKey: string | undefined,
  fetchPage: typeof fetch = fetch,
): Promise<{ metadata: CountryMetadataLookup; mode: "loaded" | "seeded" | "backfilled"; stats?: ImportStats }> {
  let client: PoolClient;
  try { client = await database.connect(); }
  catch { throw new Error("PostgreSQL initialization connection failed"); }
  let failed = false;
  let transaction = false;
  try {
    // Warm boot: no DDL, external requests or key validation.
    if (await completed(client)) return { metadata: await loadMetadata(client), mode: "loaded" };

    await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
    transaction = true;
    // A competing importer may fetch up to 100 pages with 15s per request.
    // Override pg's normal 5s query timeout only for this bounded lock wait.
    await client.query("SET LOCAL statement_timeout = '30min'");
    const lockQuery = {
      text: "SELECT pg_advisory_xact_lock($1)", values: [initializationLock], query_timeout: 1_805_000,
    };
    await client.query(lockQuery);
    await client.query("SET LOCAL statement_timeout = '5s'");
    // Another process may have finished while this one waited.
    if (await completed(client)) {
      const metadata = await loadMetadata(client);
      await client.query("COMMIT");
      return { metadata, mode: "loaded" };
    }
    await client.query(await readFile(new URL("../../db/schema.sql", import.meta.url), "utf8"));
    // Serialize legacy writers/reset while deciding between seed and backfill.
    await client.query("LOCK TABLE capitals IN SHARE ROW EXCLUSIVE MODE");
    const { rows: [existing] } = await client.query<{ present: boolean }>("SELECT EXISTS (SELECT 1 FROM capitals) AS present");
    const { capitals, metadata, stats } = await fetchCapitalData(apiKey, fetchPage);
    if (capitals.length === 0) throw new ImportError("REST Countries returned no valid capitals; initialization incomplete", stats);
    // A populated legacy database must preserve IDs, edits AND deleted defaults.
    if (!existing.present) await insertCapitals(client, capitals, stats);
    for (const [country, facts] of metadata) {
      await client.query(`
        INSERT INTO country_metadata (country_key, flag_code, continents, population, currencies)
        VALUES ($1, $2, $3, $4, $5)
        ON CONFLICT (country_key) DO UPDATE SET flag_code = EXCLUDED.flag_code,
          continents = EXCLUDED.continents, population = EXCLUDED.population, currencies = EXCLUDED.currencies
      `, [country, facts.flagCode, facts.continents === null ? null : JSON.stringify(facts.continents),
        facts.population, facts.currencies === null ? null : JSON.stringify(facts.currencies)]);
    }
    await client.query("INSERT INTO import_state (source) VALUES ($1)", [source]);
    await client.query("COMMIT");
    return { metadata, mode: existing.present ? "backfilled" : "seeded", stats };
  } catch (error) {
    failed = true;
    if (transaction) {
      try { await client.query("ROLLBACK"); } catch { /* Never claim initialization succeeded. */ }
    }
    if (error instanceof ImportError) throw new ImportError(error.message, { ...error.stats, inserted: 0 });
    // Raw pg errors can contain credentials, connection details or imported data.
    throw new Error("PostgreSQL initialization failed; no successful commit (check database permissions and schema)");
  } finally { client.release(failed); }
}
