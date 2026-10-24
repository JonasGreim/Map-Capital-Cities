import "./env.js";
import pg from "pg";
import { setTimeout } from "node:timers/promises";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2_000,
  query_timeout: 5_000,
});

export async function waitForDatabase(
  database: { query(sql: string): Promise<unknown> },
  { attempts = 10, delayMs = 1_000 } = {},
) {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await database.query("select 1");
      return;
    } catch {
      if (attempt === attempts) throw new Error(`PostgreSQL not ready after ${attempts} attempts`);
      await setTimeout(delayMs);
    }
  }
}
