import "./env.js";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import Fastify from "fastify";
import { pool } from "./db.js";
import { capitalRoutes } from "./capital-routes.js";
import type { CapitalDatabase } from "./capitals.js";
import type { CountryMetadataLookup } from "./import-capitals.js";
import { resetRoutes } from "./reset-capitals.js";

export function buildApp(database: CapitalDatabase = pool, metadata: CountryMetadataLookup = new Map(), options: {
  corsOrigins?: string;
  publicDemo?: boolean;
} = {}) {
  const origins = options.corsOrigins ?? process.env.CORS_ORIGINS;
  const allowedOrigins = origins?.split(",").map(origin => origin.trim());
  for (const origin of allowedOrigins ?? []) {
    const url = new URL(origin);
    if (!["http:", "https:"].includes(url.protocol) || url.origin !== origin) {
      throw new Error("CORS_ORIGINS must contain exact HTTP(S) origins without paths or credentials");
    }
  }
  const app = Fastify({ bodyLimit: 16_384, requestTimeout: 15_000, trustProxy: false,
    // A 200-character name can occupy 2400 URL characters when percent-encoded.
    routerOptions: { maxParamLength: 2_400 },
    ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  app.register(cors, { origin: allowedOrigins ?? (process.env.NODE_ENV === "production" ? false : "*"),
    methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"], allowedHeaders: ["Content-Type", "Accept"] });
  if (options.publicDemo ?? process.env.PUBLIC_DEMO === "true") {
    // Shared budgets protect this single free instance regardless of proxy/IP
    // headers. No trustProxy=true, spoofable client keys or unbounded IP cache.
    app.register(rateLimit, {
      timeWindow: 60_000,
      max: request => request.routeOptions.url === "/capital-reset" ? 3 : 60,
      keyGenerator: request => request.routeOptions.url === "/capital-reset" ? "shared-resets" : "shared-writes",
      allowList: request => !["POST", "PUT", "DELETE"].includes(request.method),
    });
  }

  app.get("/health", async (_request, reply) => {
    try {
      await database.query("select 1");
      return { ok: true };
    } catch {
      return reply.code(500).send({ error: "Database unavailable" });
    }
  });

  app.register(async (routes) => { capitalRoutes(routes, database, metadata); });
  app.register(async (routes) => { resetRoutes(routes, database, metadata); });

  return app;
}
