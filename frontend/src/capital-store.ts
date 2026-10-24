import { create } from "zustand";
import { createCapital, updateCapital, deleteCapital, getCapitals, type Capital, type CapitalInput } from "./api";

type CapitalState = {
  capitals: Capital[];
  loading: boolean;
  error: string | null;
  mutating: boolean;
  fetchCapitals: () => Promise<void>;
  saveCapital: (input: CapitalInput, id?: number) => Promise<void>;
  removeCapital: (id: number) => Promise<void>;
};

// Share a pending request across consumers, including React effect remounts.
let pendingRequest: Promise<void> | undefined;

export const useCapitalStore = create<CapitalState>((set, get) => {
  async function mutate(operation: () => Promise<Capital | void>, id?: number) {
    if (get().loading || get().mutating) throw new Error("Please wait for the current request to finish.");
    set({ mutating: true });
    try {
      const saved = await operation();
      // Apply only confirmed server results. Both views subscribe to this array;
      // no follow-up GET can fail after a successful write or overwrite it.
      set((state) => {
        const capitals = state.capitals.filter((capital) => capital.id !== (saved ? saved.id : id));
        if (saved) capitals.push(saved);
        capitals.sort((a, b) => a.name.toLowerCase().localeCompare(b.name.toLowerCase()) || a.id - b.id);
        return { capitals, error: null };
      });
    } finally { set({ mutating: false }); }
  }
  return {
    capitals: [],
    loading: false,
    error: null,
    mutating: false,
    saveCapital: (input, id) => mutate(() => id === undefined ? createCapital(input) : updateCapital(id, input)),
    removeCapital: (id) => mutate(() => deleteCapital(id), id),
    fetchCapitals: () => {
      if (pendingRequest) return pendingRequest;
      if (get().mutating) return Promise.resolve();
      set({ loading: true, error: null });
      pendingRequest = getCapitals()
        .then((capitals) => { set({ capitals, loading: false }); })
        .catch((error: unknown) => {
          set({ loading: false, error: error instanceof Error ? error.message : "Unable to load capitals. Please try again." });
        })
        .finally(() => { pendingRequest = undefined; });
      return pendingRequest;
    },
  };
});
