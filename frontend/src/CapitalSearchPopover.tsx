import { useEffect, useRef, type RefObject } from "react";
import type { Capital } from "./api";
import { CountryFlag } from "./CountryFlag";

// This view consumes CapitalList's query/results; opening it never fetches data.
export function CapitalSearchPopover({ query, onQuery, capitals, total, loading, error, picking, trigger, onClose, onSelect, onRetry }: {
  query: string;
  onQuery: (query: string) => void;
  capitals: Capital[];
  total: number;
  loading: boolean;
  error: string | null;
  picking: boolean;
  trigger: RefObject<HTMLButtonElement>;
  onClose: () => void;
  onSelect: (capital: Capital) => void;
  onRetry: () => Promise<void>;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  useEffect(() => {
    input.current?.focus({ preventScroll: true });
    const key = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        trigger.current?.focus({ preventScroll: true });
      }
    };
    const outside = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || panel.current?.contains(event.target) || trigger.current?.contains(event.target)) return;
      // Restore focus when clicking non-focusable map/background, while allowing
      // another button/link to receive its normal pointer focus.
      if (panel.current?.contains(document.activeElement)) trigger.current?.focus({ preventScroll: true });
      onClose();
    };
    const focus = (event: FocusEvent) => {
      if (event.target instanceof Node && !panel.current?.contains(event.target) && !trigger.current?.contains(event.target)) onClose();
    };
    document.addEventListener("keydown", key);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focus);
    return () => {
      document.removeEventListener("keydown", key);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focus);
    };
  }, [onClose, trigger]);

  return <div ref={panel} id="capital-search-popover" className="capital-search-popover" role="dialog" aria-labelledby="compact-search-heading">
    <h2 id="compact-search-heading">Search capitals</h2>
    <div className="list-search">
      <label className="visually-hidden" htmlFor="compact-capital-search">Search countries or capitals</label>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
      <input ref={input} id="compact-capital-search" type="search" placeholder="Search countries or capitals…" value={query}
        onChange={event => onQuery(event.target.value)} aria-describedby="compact-search-count" />
      {query && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => { onQuery(""); input.current?.focus(); }}>×</button>}
    </div>
    <p id="compact-search-count" className="search-results-count" role="status">{!loading && !error ? `${capitals.length} of ${total} ${total === 1 ? "capital" : "capitals"}` : ""}</p>
    <div className="list-content" aria-busy={loading}>
      {loading ? <p className="state-message">Loading capitals…</p>
        : error ? <div className="state-message"><p role="alert">{error}</p><button type="button" onClick={() => { input.current?.focus({ preventScroll: true }); void onRetry(); }}>Try again</button></div>
        : capitals.length === 0 ? <p className="state-message">{total ? "No matching capitals. Try another search or continent." : "No capitals available yet."}</p>
        : <ul className="capital-list">{capitals.map(capital => <li key={capital.id}>
          <button type="button" className="capital-label" disabled={picking} aria-label={`Show ${capital.name}, ${capital.country} on map`} onClick={() => onSelect(capital)}>
            <CountryFlag code={capital.flagCode} /><span className="capital-context"><span className="capital-name">{capital.name}</span><span className="country">{capital.country}</span></span>
          </button>
        </li>)}</ul>}
    </div>
  </div>;
}
