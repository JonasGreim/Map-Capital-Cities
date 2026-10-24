import "./env.js";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { pool } from "./db.js";

type HealthDatabase = { query(sql: string): Promise<unknown> };

export function buildApp(database: HealthDatabase = pool) {
  const app = Fastify();
  app.register(cors, { methods: ["GET", "HEAD", "PUT", "PATCH", "POST", "DELETE"] });

  app.get("/health", async () => {
    await database.query("select 1");
    return { ok: true };
  });

  return app;
}
