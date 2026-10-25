import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CapitalActionsMenu } from "./CapitalActionsMenu";
import type { Capital } from "./api";
import { useCapitalStore } from "./capital-store";
import { CapitalForm } from "./CapitalForm";
import { DeleteCapitalDialog } from "./DeleteCapitalDialog";
import { CountryFlag } from "./CountryFlag";
import { ResetCapitalsDialog } from "./ResetCapitalsDialog";
import { continentNames, matchesContinent, type ContinentFilter } from "./continent-filter";

type CapitalListProps = {
  capitals: Capital[];
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
  collapsed?: boolean;
};

export function filterCapitals(capitals: Capital[], query: string, continent: ContinentFilter = "") {
  const search = query.trim().toLowerCase();
  return capitals.filter((capital) => matchesContinent(capital, continent)
    && (capital.name.toLowerCase().includes(search) || capital.country.toLowerCase().includes(search)));
}

export function centerRowInList(scroller: HTMLDivElement, row: HTMLButtonElement) {
  const bounds = row.getBoundingClientRect();
  const viewport = scroller.getBoundingClientRect();
  const centered = scroller.scrollTop + bounds.top - viewport.top - scroller.clientTop
    + bounds.height / 2 - scroller.clientHeight / 2;
  scroller.scrollTop = Math.max(0, Math.min(centered, scroller.scrollHeight - scroller.clientHeight));
}

export function CapitalList({ capitals, loading, error, onRetry, collapsed = false }: CapitalListProps) {
  const results = useRef<HTMLDivElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const retryPending = useRef(false);
  const { continent, setContinent, mutating, saveCapital, removeCapital, resetCapitals, selectedCapitalId, selectionSource, selectionVersion, selectCapital } = useCapitalStore();
  const selectedRow = useRef<HTMLButtonElement>(null);
  const [editor, setEditor] = useState<{ capital?: Capital } | null>(null);
  const [deleting, setDeleting] = useState<Capital | null>(null);
  const [resetting, setResetting] = useState(false);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [actions, setActions] = useState<{ capital: Capital; trigger: HTMLButtonElement } | null>(null);
  const closeActions = useCallback(() => setActions(null), []);
  const filtered = useMemo(() => filterCapitals(capitals, query, continent), [capitals, query, continent]);

  useEffect(() => {
    // Reveal only within the list's own scroller. Never move the page, steal
    // focus, open the sidebar or change a search on marker activation.
    if (selectionSource !== "map" || collapsed) return;
    const row = selectedRow.current;
    const scroller = results.current;
    if (!row || !scroller) return;
    centerRowInList(scroller, row);
  }, [selectedCapitalId, selectionSource, selectionVersion, collapsed]);

  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    if (loading || !retryPending.current) return;
    retryPending.current = false;
    // Leave focus on results after success; respect users who moved elsewhere.
    if (error && document.activeElement === results.current) retryButton.current?.focus();
  }, [loading, error]);

  function retry() {
    closeActions();
    setNotice("");
    retryPending.current = true;
    results.current?.focus({ preventScroll: true });
    void onRetry();
  }

  return (
    <aside id="capital-sidebar" className="sidebar" hidden={collapsed} aria-labelledby="capitals-heading">
      <div className="list-heading">
        <h2 id="capitals-heading">Countries &amp; capitals</h2>
        {!loading && !error && <span className="count" aria-label={`${capitals.length} ${capitals.length === 1 ? "capital" : "capitals"}`}>{capitals.length}</span>}
      </div>
      <div className="list-search">
        <label className="visually-hidden" htmlFor="capital-search">Search countries or capitals</label>
        <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
        <input ref={searchInput} id="capital-search" type="search" placeholder="Search countries or capitals…" value={query}
          onChange={(event) => { setQuery(event.target.value); closeActions(); }} aria-describedby="search-results-count" />
        {query && <button type="button" className="search-clear" aria-label="Clear search" onClick={() => {
          setQuery(""); closeActions(); searchInput.current?.focus({ preventScroll: true });
        }}>×</button>}
      </div>
      <div className="list-continent">
        <label htmlFor="continent-filter">Continent</label>
        <select id="continent-filter" value={continent} aria-describedby="search-results-count"
          onChange={(event) => { setContinent(event.target.value as ContinentFilter); closeActions(); }}>
          <option value="">All continents</option>
          {continentNames.map(name => <option key={name} value={name}>{name}</option>)}
        </select>
      </div>
      <div className="list-actions">
        <button id="add-capital" type="button" disabled={loading || mutating || !!error} onClick={() => { setNotice(""); setEditor({}); }}><span aria-hidden="true">＋</span> Add capital</button>
        <button id="reset-capitals" type="button" className="secondary" disabled={loading || mutating || !!error}
          onClick={() => { setNotice(""); closeActions(); setResetting(true); }}>Reset to default</button>
      </div>
      <a className="skip-to-map" href="#world-map">Skip to map</a>
      <p className="mutation-notice" role="status" aria-live="polite" aria-atomic="true">{notice}</p>
      <p id="search-results-count" className={query.trim() || continent ? "search-results-count" : "visually-hidden"} role="status">
        {!loading && !error ? `${filtered.length} of ${capitals.length} ${capitals.length === 1 ? "capital" : "capitals"}` : ""}
      </p>
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
        ) : filtered.length === 0 ? (
          <p className="state-message">No matching capitals. Try another search or continent.</p>
        ) : (
          <ul className="capital-list">
            {filtered.map((capital) => (
              <li key={capital.id} data-selected={selectedCapitalId === capital.id || undefined} data-actions-open={actions?.capital.id === capital.id || undefined}>
                <button type="button" className="capital-label" ref={selectedCapitalId === capital.id ? selectedRow : undefined}
                  aria-label={`Show ${capital.name}, ${capital.country} on map`} aria-pressed={selectedCapitalId === capital.id}
                  onClick={() => { closeActions(); selectCapital(capital.id); }}>
                  <CountryFlag code={capital.flagCode} />
                  <span className="capital-context"><span className="capital-name">{capital.name}</span>
                    <span className="country">{capital.country}</span></span>
                </button>
                <div className="row-actions">
                  <button id={`capital-actions-${capital.id}`} type="button" className="actions-trigger" disabled={mutating}
                    aria-label={`Actions for ${capital.name}`} aria-expanded={actions?.capital.id === capital.id} aria-controls={actions?.capital.id === capital.id ? `capital-options-${capital.id}` : undefined}
                    onClick={(event) => setActions(actions?.capital.id === capital.id ? null : { capital, trigger: event.currentTarget })}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {actions && <CapitalActionsMenu id={actions.capital.id} name={actions.capital.name} trigger={actions.trigger}
        hidden={collapsed || loading || !!error || mutating || !filtered.some(capital => capital.id === actions.capital.id)}
        onClose={closeActions}
        onEdit={() => { setNotice(""); setEditor({ capital: actions.capital }); }}
        onDelete={() => { setNotice(""); setDeleting(actions.capital); }} />}
      {editor && <CapitalForm capital={editor.capital} onCancel={() => setEditor(null)} onSave={async (input, id) => {
        await saveCapital(input, id);
        setNotice(id === undefined ? "Capital created." : "Capital updated.");
      }} />}
      {deleting && <DeleteCapitalDialog capital={deleting} onCancel={() => setDeleting(null)} onDelete={async (id) => {
        await removeCapital(id);
        setNotice("Capital deleted.");
      }} />}
      {resetting && <ResetCapitalsDialog onCancel={() => {
        setResetting(false);
        if (error) requestAnimationFrame(() => retryButton.current?.focus());
      }} onReset={async () => {
        await resetCapitals();
        setNotice("Default capitals restored. Marker colors reset to Teal.");
      }} onReload={async () => {
        await onRetry();
        const failure = useCapitalStore.getState().error;
        if (failure) throw new Error(failure);
      }} />}
    </aside>
  );
}
