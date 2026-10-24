export type Capital = {
  id: number;
  name: string;
  country: string;
  latitude: number;
  longitude: number;
};

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
  return data;
}
