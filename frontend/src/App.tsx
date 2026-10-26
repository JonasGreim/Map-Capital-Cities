import { useCallback, useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore } from "react";
import { Brand } from "./Brand";
import { CapitalList } from "./CapitalList";
import { Map } from "./Map";
import { useCapitalStore } from "./capital-store";
import { CapitalActions, useCapitalActions } from "./CapitalActions";

import { MobileNavigation, type MobileView } from "./MobileNavigation";

const mobileQuery = "(max-width: 700px)";
const subscribeViewport = (notify: () => void) => {
  const media = window.matchMedia(mobileQuery);
  media.addEventListener("change", notify);
  return () => media.removeEventListener("change", notify);
};

export function App() {
  return <CapitalActions><AppLayout /></CapitalActions>;
}

function AppLayout() {
  const mobile = useSyncExternalStore(subscribeViewport, () => window.matchMedia(mobileQuery).matches, () => false);
  const [view, setView] = useState<MobileView>("map");
  const { picking, closeActions } = useCapitalActions();
  const activeView = picking ? "map" : view;
  const mapActive = !mobile || activeView === "map";
  const showMap = useCallback(() => setView("map"), []);
  const layout = useRef<HTMLDivElement>(null);
  const lastFocus = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const remember = (event: FocusEvent) => { if (event.target instanceof HTMLElement) lastFocus.current = event.target; };
    document.addEventListener("focusin", remember);
    return () => document.removeEventListener("focusin", remember);
  }, []);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const listActive = mobile ? activeView === "capitals" : sidebarOpen;
  useLayoutEffect(() => {
    // A breakpoint change can hide the focused pane or the navigation itself.
    const focused = document.activeElement === document.body ? lastFocus.current : document.activeElement;
    if (focused instanceof HTMLElement && (!focused.isConnected || focused.closest("[hidden]")
      || (!mobile && focused.closest(".mobile-navigation"))
      || (mobile && focused.closest(".sidebar-toggle")))) {
      const target = mobile ? document.getElementById(`${activeView}-tab`)
        : layout.current?.querySelector<HTMLElement>(".sidebar-toggle");
      target?.focus({ preventScroll: true });
    }
  }, [mobile, activeView, listActive]);
  const { capitals, loading, error, fetchCapitals } = useCapitalStore();
  useEffect(() => { void fetchCapitals(); }, [fetchCapitals]);

  return (
    <main className="app">
      {mobile && <header className="app-header"><Brand /></header>}
      <div ref={layout} className={`layout${!mobile && !sidebarOpen ? " sidebar-collapsed" : ""}`}>
        <CapitalList capitals={capitals} loading={loading} error={error} onRetry={fetchCapitals} collapsed={!listActive} mobile={mobile} onShowMap={showMap} onExpand={() => setSidebarOpen(true)} />
        <section id="world-map" className="map-panel" hidden={!mapActive} role={mobile ? "tabpanel" : undefined} aria-labelledby={mobile ? "map-tab" : undefined} aria-label={mobile ? undefined : "World map"} tabIndex={-1}>
          <button type="button" className="sidebar-toggle secondary" aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={sidebarOpen} aria-controls="capital-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={sidebarOpen ? "m13 6-6 6 6 6m6-12-6 6 6 6" : "m5 6 6 6-6 6m6-12 6 6-6 6"} /></svg>
          </button>
          <Map active={mapActive} />
        </section>
      </div>
      <MobileNavigation active={activeView} disabled={picking} onChange={next => { closeActions(); setView(next); }} />
    </main>
  );
}
