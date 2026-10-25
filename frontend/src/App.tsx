import { useEffect, useState } from "react";
import { CapitalList } from "./CapitalList";
import { Map } from "./Map";
import { useCapitalStore } from "./capital-store";

export function App() {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const { capitals, loading, error, fetchCapitals } = useCapitalStore();
  useEffect(() => { void fetchCapitals(); }, [fetchCapitals]);

  return (
    <main className="app">
      <header className="app-header">
        <a className="brand-link" href="/" aria-label="Map Capital Cities – Home">
          <svg className="brand-globe" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="21" /><ellipse cx="24" cy="24" rx="10" ry="21" /><path d="M3 24h42M7 12h34M7 36h34" /></svg>
          <div>
            <h1>Map Capital Cities</h1>
            <p>Discover countries and their capitals around the world.</p>
          </div>
        </a>
      </header>
      <div className={`layout${sidebarOpen ? "" : " sidebar-collapsed"}`}>
        <CapitalList capitals={capitals} loading={loading} error={error} onRetry={fetchCapitals} collapsed={!sidebarOpen} />
        <section id="world-map" className="map-panel" aria-label="World map" tabIndex={-1}>
          <button type="button" className="sidebar-toggle secondary" aria-label={sidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
            aria-expanded={sidebarOpen} aria-controls="capital-sidebar" onClick={() => setSidebarOpen(!sidebarOpen)}>
            <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d={sidebarOpen ? "m13 6-6 6 6 6m6-12-6 6 6 6" : "m5 6 6 6-6 6m6-12 6 6-6 6"} /></svg>
          </button>
          <Map />
        </section>
      </div>
    </main>
  );
}
