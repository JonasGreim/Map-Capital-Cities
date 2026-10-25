import { buildApp } from "./app.js";
import { pool, waitForDatabase } from "./db.js";
import { ImportError, importCapitals } from "./import-capitals.js";

const flagCodes = new Map<string, string | null>();
const app = buildApp(pool, flagCodes);
app.addHook("onClose", async () => { await pool.end(); });

const port = Number(process.env.PORT ?? 3001);
try {
  await waitForDatabase(pool);
  const { flagCodes: importedCodes, ...stats } = await importCapitals(pool, process.env.RESTCOUNTRIES_API_KEY);
  importedCodes.forEach((code, country) => flagCodes.set(country, code));
  console.log("REST Countries import complete", stats);
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
