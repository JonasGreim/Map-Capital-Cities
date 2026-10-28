import { buildApp } from "./app.js";
import { pool, waitForDatabase } from "./db.js";
import { ImportError, type CountryMetadata } from "./import-capitals.js";
import { initializeDatabase } from "./initialize-database.js";

const metadata = new Map<string, CountryMetadata>();
const app = buildApp(pool, metadata);
app.addHook("onClose", async () => { await pool.end(); });

const port = Number(process.env.PORT ?? 3001);
try {
  await waitForDatabase(pool);
  const { metadata: importedMetadata, mode, stats } = await initializeDatabase(pool, process.env.RESTCOUNTRIES_API_KEY);
  importedMetadata.forEach((value, country) => metadata.set(country, value));
  console.log("Database initialization complete", { mode, ...stats });
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API on http://localhost:${port}`);
} catch (error) {
  console.error("Backend startup failed:", error instanceof Error ? error.message : "Unknown error");
  if (error instanceof ImportError) console.error("REST Countries import failed; no successful commit", error.stats);
  await app.close();
  process.exitCode = 1;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void app.close(); });
}
