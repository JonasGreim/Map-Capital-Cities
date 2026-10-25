export type MobileView = "map" | "capitals";

export function tabDestination(key: string, current: MobileView): MobileView | undefined {
  if (key === "Home") return "map";
  if (key === "End") return "capitals";
  if (key === "ArrowLeft" || key === "ArrowRight") return current === "map" ? "capitals" : "map";
}

export function MobileNavigation({ active, onChange, disabled = false }: {
  active: MobileView; onChange: (view: MobileView) => void; disabled?: boolean;
}) {
  return <nav className="mobile-navigation" aria-label="Mobile views">
    <div role="tablist" aria-label="Map and capitals">
      {(["map", "capitals"] as const).map(view => <button key={view} id={`${view}-tab`} type="button" role="tab"
        aria-selected={active === view} aria-controls={view === "map" ? "world-map" : "capital-sidebar"}
        tabIndex={active === view ? 0 : -1} disabled={disabled}
        onClick={() => onChange(view)} onKeyDown={event => {
          const next = tabDestination(event.key, view);
          if (!next) return;
          event.preventDefault();
          onChange(next);
          document.getElementById(`${next}-tab`)?.focus({ preventScroll: true });
        }}>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">{view === "map"
          ? <><path d="m3 5 6-2 6 2 6-2v16l-6 2-6-2-6 2V5ZM9 3v16M15 5v16" /></>
          : <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>}</svg>
        {view === "map" ? "Map" : "Capitals"}
      </button>)}
    </div>
  </nav>;
}
