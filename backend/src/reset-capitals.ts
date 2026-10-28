import type { FastifyError, FastifyInstance } from "fastify";
import { capitalStore, type CapitalDatabase } from "./capitals.js";
import { defaultCapitals } from "./default-capitals.js";
import { countryMetadata, type CountryMetadataLookup } from "./import-capitals.js";

export async function resetCapitals(database: CapitalDatabase) {
  if (!database.connect) throw new Error("Reset requires a transactional database");
  const client = await database.connect();
  let failed = false;
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL lock_timeout = '2s'");
    await client.query("SET LOCAL statement_timeout = '4s'");
    // Serialize writers, including another backend process, without blocking reads.
    await client.query("LOCK TABLE capitals IN SHARE ROW EXCLUSIVE MODE");
    await client.query("DELETE FROM capitals");
    const store = capitalStore(client);
    for (const capital of defaultCapitals) await store.create(capital);
    const capitals = await store.list();
    await client.query("COMMIT");
    return capitals;
  } catch (error) {
    failed = true;
    try { await client.query("ROLLBACK"); } catch { /* The commit outcome can be uncertain; never claim success. */ }
    throw error;
  } finally { client.release(failed); }
}

// Public demo operation, explicitly approved in #19. Confirmation is not auth.
export function resetRoutes(app: FastifyInstance, database: CapitalDatabase, metadata: CountryMetadataLookup) {
  let pending = false;
  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    if (error.statusCode === 429) return reply.code(429).send({ error: "Too many demo resets. Please wait a minute and try again." });
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: "Invalid reset request" });
    }
    return reply.code(500).send({ error: "Unable to reset capitals" });
  });
  app.post("/capital-reset", {
    onRequest: async (request, reply) => {
      const type = request.headers["content-type"];
      if (type && !/^application\/json(?:\s*;|$)/i.test(type)) {
        return reply.code(415).send({ error: "Content-Type must be application/json" });
      }
    },
    schema: { body: { type: "object", additionalProperties: false, required: ["confirm"], properties: { confirm: { const: true, type: "boolean" } } } },
  }, async (_request, reply) => {
    if (pending) return reply.code(409).send({ error: "A reset is already in progress" });
    pending = true;
    try {
      const capitals = await resetCapitals(database);
      return capitals.map(capital => ({ ...capital, ...countryMetadata(metadata, capital.country) }));
    } finally { pending = false; }
  });
}
