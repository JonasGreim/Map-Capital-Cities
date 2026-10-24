import { useEffect } from "react";
import { CapitalList } from "./CapitalList";
import { Map } from "./Map";
import { useCapitalStore } from "./capital-store";

export function App() {
  const { capitals, loading, error, fetchCapitals } = useCapitalStore();
  useEffect(() => { void fetchCapitals(); }, [fetchCapitals]);

  return (
    <main className="app">
      <header className="app-header">
        <h1>Capital Cities</h1>
        <p>Discover countries and their capitals around the world.</p>
      </header>
      <div className="layout">
        <CapitalList capitals={capitals} loading={loading} error={error} onRetry={fetchCapitals} />
        <section id="world-map" className="map-panel" aria-label="World map" tabIndex={-1}>
          <Map />
        </section>
      </div>
    </main>
  );
}
