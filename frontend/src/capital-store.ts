import { create } from "zustand";
import { createCapital, updateCapital, deleteCapital, getCapitals, resetCapitals, type Capital, type CapitalInput } from "./api";
import { matchesContinent, type ContinentFilter } from "./continent-filter";
import { removeMarkerColor, clearMarkerColors } from "./marker-color-storage";

type CapitalState = {
  capitals: Capital[];
  loading: boolean;
  hasLoaded: boolean;
  error: string | null;
  mutating: boolean;
  selectedCapitalId: number | null;
  selectionSource: "list" | "map";
  selectionVersion: number;
  resetVersion: number;
  continent: ContinentFilter;
  setContinent: (continent: ContinentFilter) => void;
  selectCapital: (id: number | null, source?: "list" | "map") => void;
  fetchCapitals: () => Promise<void>;
  saveCapital: (input: CapitalInput, id?: number) => Promise<void>;
  removeCapital: (id: number) => Promise<void>;
  resetCapitals: () => Promise<void>;
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
        return { capitals, error: null, selectedCapitalId: capitals.some((capital) => capital.id === state.selectedCapitalId && matchesContinent(capital, state.continent)) ? state.selectedCapitalId : null };
      });
    } finally { set({ mutating: false }); }
  }
  return {
    capitals: [],
    loading: false,
    hasLoaded: false,
    error: null,
    mutating: false,
    selectedCapitalId: null,
    selectionSource: "list",
    selectionVersion: 0,
    resetVersion: 0,
    continent: "",
    setContinent: (continent) => set(state => ({ continent,
      selectedCapitalId: state.capitals.some(capital => capital.id === state.selectedCapitalId && matchesContinent(capital, continent))
        ? state.selectedCapitalId : null,
    })),
    selectCapital: (id, source = "list") => {
      if (id !== null && !get().capitals.some((capital) => capital.id === id && matchesContinent(capital, get().continent))) return;
      set((state) => ({ selectedCapitalId: id, selectionSource: source, selectionVersion: state.selectionVersion + 1 }));
    },
    saveCapital: (input, id) => mutate(async () => {
      const saved = await (id === undefined ? createCapital(input) : updateCapital(id, input));
      // A confirmed create owns a new record, even if an old ID was reused.
      if (id === undefined) removeMarkerColor(saved.id);
      return saved;
    }),
    removeCapital: (id) => mutate(async () => {
      await deleteCapital(id);
      removeMarkerColor(id);
    }, id),
    resetCapitals: async () => {
      if (get().loading || get().mutating) throw new Error("Please wait for the current request to finish.");
      set({ mutating: true });
      try {
        const capitals = await resetCapitals();
        clearMarkerColors();
        set((state) => ({ capitals, error: null, selectedCapitalId: null, resetVersion: state.resetVersion + 1 }));
      } finally { set({ mutating: false }); }
    },
    fetchCapitals: () => {
      if (pendingRequest) return pendingRequest;
      if (get().mutating) return Promise.resolve();
      set({ loading: true, error: null });
      pendingRequest = getCapitals()
        .then((capitals) => { set((state) => ({ capitals, loading: false, hasLoaded: true,
          selectedCapitalId: capitals.some((capital) => capital.id === state.selectedCapitalId && matchesContinent(capital, state.continent)) ? state.selectedCapitalId : null })); })
        .catch((error: unknown) => {
          set({ loading: false, error: error instanceof Error ? error.message : "Unable to load capitals. Please try again." });
        })
        .finally(() => { pendingRequest = undefined; });
      return pendingRequest;
    },
  };
});
