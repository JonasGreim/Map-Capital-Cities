import { readContinents, type Continent } from "./continent-filter";
import { flagUrl } from "./country-flag";

export type CapitalInput = {
  name: string;
  country: string;
  latitude: number;
  longitude: number;
};

export type Capital = CapitalInput & { id: number; flagCode?: string | null; continents?: Continent[] | null };

function readMetadata(capital: Capital): Capital {
  return { ...capital,
    ...(capital.flagCode !== undefined ? { flagCode: flagUrl(capital.flagCode) ? capital.flagCode!.toUpperCase() : null } : {}),
    ...(capital.continents !== undefined ? { continents: readContinents(capital.continents) } : {}),
  };
}

function isCapital(value: unknown): value is Capital {
  if (typeof value !== "object" || value === null) return false;
  const capital = value as Record<string, unknown>;
  return Number.isInteger(capital.id) && typeof capital.id === "number" && capital.id > 0
    && typeof capital.name === "string" && capital.name.trim().length > 0
    && typeof capital.country === "string" && capital.country.trim().length > 0
    && typeof capital.latitude === "number" && Number.isFinite(capital.latitude)
    && Math.abs(capital.latitude) <= 90
    && typeof capital.longitude === "number" && Number.isFinite(capital.longitude)
    && Math.abs(capital.longitude) <= 180;
}

export async function getCapitals(): Promise<Capital[]> {
  const signal = AbortSignal.timeout(15_000);
  const timeoutMessage = "The capital API took too long to respond. Please try again.";
  let response: Response;
  try {
    response = await fetch("/capital", { headers: { Accept: "application/json" }, signal });
  } catch {
    if (signal.aborted) throw new Error(timeoutMessage);
    throw new Error("Could not reach the capital API. Check your connection and try again.");
  }
  if (!response.ok) {
    throw new Error(`Unable to load capitals (HTTP ${response.status}). Please try again.`);
  }

  let data: unknown;
  try {
    data = await response.json();
  } catch {
    if (signal.aborted) throw new Error(timeoutMessage);
    throw new Error("The capital API returned an invalid response. Please try again.");
  }
  if (!Array.isArray(data) || !data.every(isCapital)) {
    throw new Error("The capital API returned an invalid response. Please try again.");
  }
  return data.map(readMetadata);
}

async function mutateCapital(method: "POST" | "PUT" | "DELETE", id?: number, input?: CapitalInput): Promise<Capital | void> {
  const signal = AbortSignal.timeout(15_000);
  const uncertain = "The change may have been saved. Reload the page before trying again.";
  let response: Response;
  try {
    response = await fetch(id === undefined ? "/capital" : `/capital/${id}`, {
      method,
      headers: { Accept: "application/json", ...(input ? { "Content-Type": "application/json" } : {}) },
      ...(input ? { body: JSON.stringify({ name: input.name, country: input.country, latitude: input.latitude, longitude: input.longitude }) } : {}),
      signal,
    });
  } catch {
    throw new Error(`${signal.aborted ? "The capital API took too long to respond." : "Could not reach the capital API."} ${uncertain}`);
  }
  if (!response.ok) {
    const messages: Record<number, string> = {
      400: "Check all fields and coordinate ranges, then try again.",
      404: "This capital no longer exists. Cancel and reload the page.",
      409: "A capital with this name or country already exists. Choose another name or country.",
    };
    throw new Error(messages[response.status] ?? "Unable to save the change. Please try again.");
  }
  if (method === "DELETE" && response.status === 204) return;
  let data: unknown;
  try { data = await response.json(); } catch {
    throw new Error(`The capital API returned an invalid response. ${uncertain}`);
  }
  if (method === "DELETE" || !isCapital(data) || (id !== undefined && data.id !== id)) {
    throw new Error(`The capital API returned an invalid response. ${uncertain}`);
  }
  return readMetadata(data);
}

export async function createCapital(input: CapitalInput): Promise<Capital> {
  return await mutateCapital("POST", undefined, input) as Capital;
}

export async function updateCapital(id: number, input: CapitalInput): Promise<Capital> {
  return await mutateCapital("PUT", id, input) as Capital;
}

export async function deleteCapital(id: number): Promise<void> {
  await mutateCapital("DELETE", id);
}

export async function resetCapitals(): Promise<Capital[]> {
  const uncertain = "The reset may have completed. Reload current data before deciding whether to reset again.";
  let response: Response;
  try {
    response = await fetch("/capital-reset", {
      method: "POST", headers: { Accept: "application/json", "Content-Type": "application/json" },
      body: JSON.stringify({ confirm: true }), signal: AbortSignal.timeout(15_000),
    });
  } catch { throw new Error(`Could not confirm the reset. ${uncertain}`); }
  if (!response.ok) {
    if (response.status === 409) throw new Error("Another reset is in progress. Reload current data before trying again.");
    throw new Error(`Unable to reset capitals (HTTP ${response.status}). ${uncertain}`);
  }
  let data: unknown;
  try { data = await response.json(); }
  catch { throw new Error(`The capital API returned an invalid response. ${uncertain}`); }
  if (!Array.isArray(data) || data.length === 0 || !data.every(isCapital)
    || new Set(data.map(capital => capital.id)).size !== data.length) {
    throw new Error(`The capital API returned an invalid response. ${uncertain}`);
  }
  return data.map(readMetadata);
}
