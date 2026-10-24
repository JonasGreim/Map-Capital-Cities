import { buildApp } from "./app.js";
import { pool } from "./db.js";

const app = buildApp();
app.addHook("onClose", async () => { await pool.end(); });

// TODO (candidate): import data on startup + /capital endpoints (see README)

const port = Number(process.env.PORT ?? 3001);
try {
  await app.listen({ port, host: "0.0.0.0" });
  console.log(`API on http://localhost:${port}`);
} catch (error) {
  console.error(error);
  await app.close();
  process.exitCode = 1;
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => { void app.close(); });
}
