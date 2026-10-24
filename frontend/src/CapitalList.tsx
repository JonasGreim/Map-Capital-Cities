import { useEffect, useRef } from "react";
import type { Capital } from "./api";

type CapitalListProps = {
  capitals: Capital[];
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
};

export function CapitalList({ capitals, loading, error, onRetry }: CapitalListProps) {
  const results = useRef<HTMLDivElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const retryPending = useRef(false);

  useEffect(() => {
    if (loading || !retryPending.current) return;
    retryPending.current = false;
    // Leave focus on results after success; respect users who moved elsewhere.
    if (error && document.activeElement === results.current) retryButton.current?.focus();
  }, [loading, error]);

  function retry() {
    retryPending.current = true;
    results.current?.focus({ preventScroll: true });
    void onRetry();
  }

  return (
    <aside className="sidebar" aria-labelledby="capitals-heading">
      <div className="list-heading">
        <h2 id="capitals-heading">Countries &amp; capitals</h2>
        {!loading && !error && <span className="count" aria-label={`${capitals.length} ${capitals.length === 1 ? "capital" : "capitals"}`}>{capitals.length}</span>}
      </div>
      <div ref={results} className="list-content" role="region" aria-label="Capital results" aria-busy={loading} tabIndex={0}>
        {loading ? (
          <p className="state-message" role="status">Loading capitals…</p>
        ) : error ? (
          <div className="state-message">
            <p role="alert">{error}</p>
            <button ref={retryButton} type="button" onClick={retry}>Try again</button>
          </div>
        ) : capitals.length === 0 ? (
          <p className="state-message" role="status">No capitals available yet.</p>
        ) : (
          <ul className="capital-list">
            {capitals.map((capital) => (
              <li key={capital.id}>
                <span className="country">{capital.country}</span>
                <span className="capital-name">{capital.name}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </aside>
  );
}
