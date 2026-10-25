import type { FastifyError, FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { capitalStore, type Capital, type CapitalResponse, type CapitalDatabase, type CapitalInput } from "./capitals.js";
import { countryFlagCode } from "./import-capitals.js";

const text = { type: "string", minLength: 1, pattern: "\\S", not: { pattern: "\u0000" } };
const body = {
  type: "object",
  additionalProperties: false,
  required: ["name", "latitude", "longitude", "country"],
  properties: {
    name: text,
    latitude: { type: "number", minimum: -90, maximum: 90 },
    longitude: { type: "number", minimum: -180, maximum: 180 },
    country: text,
  },
};
const idParams = {
  type: "object", required: ["id"],
  properties: { id: { type: "string", pattern: "^[1-9][0-9]*$", maxLength: 10 } },
};

function parseId(value: string) {
  const id = Number(value);
  // PostgreSQL's integer identity cannot contain a larger ID.
  if (id > 2_147_483_647) throw Object.assign(new Error("Invalid ID"), { statusCode: 400 });
  return id;
}

async function requireJson(request: FastifyRequest, reply: FastifyReply) {
  const contentType = request.headers["content-type"];
  if (contentType && !/^application\/json(?:\s*;|$)/i.test(contentType)) {
    return reply.code(415).send({ error: "Content-Type must be application/json" });
  }
}

export function capitalRoutes(app: FastifyInstance, database: CapitalDatabase, flagCodes: ReadonlyMap<string, string | null>) {
  const store = capitalStore(database);
  const response = (capital: Capital): CapitalResponse => ({ ...capital, flagCode: countryFlagCode(flagCodes, capital.country) });

  // Scoped to capital routes so the existing health error contract stays intact.
  app.setErrorHandler<FastifyError>((error, _request, reply) => {
    if (error.code === "23505") return reply.code(409).send({ error: "Capital name or country already exists" });
    if (error.validation || error.code === "23502" || error.code === "23514") {
      return reply.code(400).send({ error: "Invalid request data" });
    }
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return reply.code(error.statusCode).send({ error: "Invalid request data" });
    }
    return reply.code(500).send({ error: "Internal server error" });
  });

  app.get("/capital", async () => (await store.list()).map(response));

  app.get<{ Params: { name: string } }>("/capital/:name", {
    schema: { params: { type: "object", required: ["name"], properties: { name: text } } },
  }, async (request, reply) => {
    const capital = await store.findByName(request.params.name);
    if (!capital) return reply.code(404).send({ error: "Capital not found" });
    return response(capital);
  });

  app.post<{ Body: CapitalInput }>("/capital", { schema: { body }, onRequest: requireJson }, async (request, reply) => {
    const capital = await store.create(request.body);
    return reply.code(201).send(response(capital));
  });

  app.put<{ Params: { id: string }; Body: CapitalInput }>("/capital/:id", {
    schema: { params: idParams, body }, onRequest: requireJson,
  }, async (request, reply) => {
    const capital = await store.update(parseId(request.params.id), request.body);
    if (!capital) return reply.code(404).send({ error: "Capital not found" });
    return response(capital);
  });

  app.delete<{ Params: { id: string } }>("/capital/:id", { schema: { params: idParams } }, async (request, reply) => {
    const capital = await store.delete(parseId(request.params.id));
    if (!capital) return reply.code(404).send({ error: "Capital not found" });
    return reply.code(204).send();
  });
}
