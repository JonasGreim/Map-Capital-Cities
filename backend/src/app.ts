import "./env.js";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { pool } from "./db.js";
import { capitalRoutes } from "./capital-routes.js";
import type { CapitalDatabase } from "./capitals.js";

export function buildApp(database: CapitalDatabase = pool) {
  const app = Fastify({ ajv: { customOptions: { coerceTypes: false, removeAdditional: false } } });
  app.register(cors, { methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"] });

  app.get("/health", async () => {
    await database.query("select 1");
    return { ok: true };
  });

  app.register(async (routes) => { capitalRoutes(routes, database); });

  return app;
}
