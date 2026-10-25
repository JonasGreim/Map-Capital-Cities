import "./env.js";
import pg from "pg";
import { setTimeout } from "node:timers/promises";

export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 2_000,
  query_timeout: 5_000,
});

// Only known temporary failures are retried. Never expose pg's raw messages:
// they can include connection settings, role names or database names.
function readinessFailure(error: unknown): { retry: boolean; reason: string } {
  const code = typeof error === "object" && error !== null && "code" in error ? error.code : undefined;
  switch (code) {
    case "ECONNREFUSED": return { retry: true, reason: "connection refused; check that PostgreSQL is running and the host/port are correct" };
    case "ETIMEDOUT":
    case "ECONNRESET":
    case "EPIPE":
    case "EAI_AGAIN":
    case "ENETUNREACH":
    case "EHOSTUNREACH":
    case "08000":
    case "08001":
    case "08003":
    case "08006": return { retry: true, reason: "temporary connection failure; check PostgreSQL and network availability" };
    case "57P03": return { retry: true, reason: "PostgreSQL is starting or recovering" };
    case "53300": return { retry: true, reason: "PostgreSQL has too many connections" };
    case "28P01":
    case "28000": return { retry: false, reason: "authentication failed; check DATABASE_URL credentials and PostgreSQL access rules" };
    case "3D000": return { retry: false, reason: "database does not exist; check the database in DATABASE_URL" };
    case "ENOTFOUND": return { retry: false, reason: "host not found; check the host in DATABASE_URL" };
  }
  // pg/pg-pool timeouts and connection closure do not always carry a code.
  if (error instanceof Error && [
    "Connection terminated due to connection timeout",
    "timeout exceeded when trying to connect",
    "Connection terminated unexpectedly",
    "Connection terminated",
    "Query read timeout",
  ].includes(error.message)) return { retry: true, reason: "connection closed or timed out; check PostgreSQL availability" };
  return { retry: false, reason: "unrecognized connection/configuration error; check DATABASE_URL and PostgreSQL settings" };
}

export async function waitForDatabase(
  database: { query(sql: string): Promise<unknown> },
  { attempts = 30, delayMs = 1_000 } = {},
) {
  if (!Number.isSafeInteger(attempts) || attempts < 1
    || !Number.isInteger(delayMs) || delayMs < 0 || delayMs > 2_147_483_647) {
    throw new Error("Database readiness requires positive integer attempts and a valid nonnegative delayMs");
  }
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      await database.query("select 1");
      return;
    } catch (error) {
      const { retry, reason } = readinessFailure(error);
      if (!retry) throw new Error(`PostgreSQL readiness failed on attempt ${attempt}: ${reason}`);
      if (attempt === attempts) throw new Error(`PostgreSQL not ready after ${attempts} attempts: ${reason}`);
      await setTimeout(delayMs);
    }
  }
}
