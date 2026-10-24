import { create } from "zustand";
import { getCapitals, type Capital } from "./api";

type CapitalState = {
  capitals: Capital[];
  loading: boolean;
  error: string | null;
  fetchCapitals: () => Promise<void>;
};

// Share a pending request across consumers, including React effect remounts.
let pendingRequest: Promise<void> | undefined;

export const useCapitalStore = create<CapitalState>((set) => ({
  capitals: [],
  loading: false,
  error: null,
  fetchCapitals: () => {
    if (pendingRequest) return pendingRequest;
    set({ loading: true, error: null });
    pendingRequest = getCapitals()
      .then((capitals) => { set({ capitals, loading: false }); })
      .catch((error: unknown) => {
        set({ loading: false, error: error instanceof Error ? error.message : "Unable to load capitals. Please try again." });
      })
      .finally(() => { pendingRequest = undefined; });
    return pendingRequest;
  },
}));
