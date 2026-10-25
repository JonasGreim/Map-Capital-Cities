import { useEffect, useRef, useState } from "react";
import type { Capital } from "./api";
import { useCapitalStore } from "./capital-store";
import { CapitalForm } from "./CapitalForm";
import { DeleteCapitalDialog } from "./DeleteCapitalDialog";

type CapitalListProps = {
  capitals: Capital[];
  loading: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
  collapsed?: boolean;
};

export function filterCapitals(capitals: Capital[], query: string) {
  const search = query.trim().toLowerCase();
  return capitals.filter((capital) => capital.name.toLowerCase().includes(search) || capital.country.toLowerCase().includes(search));
}

export function CapitalList({ capitals, loading, error, onRetry, collapsed = false }: CapitalListProps) {
  const results = useRef<HTMLDivElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const retryPending = useRef(false);
  const { mutating, saveCapital, removeCapital } = useCapitalStore();
  const [editor, setEditor] = useState<{ capital?: Capital } | null>(null);
  const [deleting, setDeleting] = useState<Capital | null>(null);
  const [notice, setNotice] = useState("");
  const [query, setQuery] = useState("");
  const [actionsId, setActionsId] = useState<number | null>(null);
  const actionsPanel = useRef<HTMLDivElement>(null);
  const actionsButton = useRef<HTMLButtonElement>(null);
  const firstAction = useRef<HTMLButtonElement>(null);
  const filtered = filterCapitals(capitals, query);

  useEffect(() => {
    if (actionsId === null) return;
    firstAction.current?.focus();
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !actionsPanel.current?.contains(event.target)) setActionsId(null);
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      actionsButton.current?.focus();
      setActionsId(null);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [actionsId]);

  useEffect(() => {
    if (loading || !retryPending.current) return;
    retryPending.current = false;
    // Leave focus on results after success; respect users who moved elsewhere.
    if (error && document.activeElement === results.current) retryButton.current?.focus();
  }, [loading, error]);

  function retry() {
    setActionsId(null);
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
        <input id="capital-search" type="search" placeholder="Search countries or capitals…" value={query}
          onChange={(event) => { setQuery(event.target.value); setActionsId(null); }} aria-describedby="search-results-count" />
      </div>
      <div className="list-actions">
        <button id="add-capital" type="button" disabled={loading || mutating || !!error} onClick={() => { setNotice(""); setEditor({}); }}><span aria-hidden="true">＋</span> Add capital</button>
        <button type="button" className="secondary" disabled={loading || mutating} onClick={retry}>Refresh list</button>
      </div>
      <a className="skip-to-map" href="#world-map">Skip to map</a>
      <p className="mutation-notice" role="status">{notice}</p>
      <p id="search-results-count" className={query.trim() ? "search-results-count" : "visually-hidden"} role="status">
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
          <p className="state-message">No matching capitals. Try another capital or country.</p>
        ) : (
          <ul className="capital-list">
            {filtered.map((capital) => (
              <li key={capital.id} data-actions-open={actionsId === capital.id || undefined}
                onBlur={(event) => { if (!event.currentTarget.contains(event.relatedTarget)) setActionsId(null); }}>
                <div className="capital-label"><span className="capital-name">{capital.name}</span>
                <span className="country">{capital.country}</span></div>
                <div className="row-actions" ref={actionsId === capital.id ? actionsPanel : undefined}>
                  <button ref={actionsId === capital.id ? actionsButton : undefined} id={`capital-actions-${capital.id}`} type="button" className="actions-trigger" disabled={mutating}
                    aria-label={`Actions for ${capital.name}`} aria-expanded={actionsId === capital.id} aria-controls={actionsId === capital.id ? `capital-options-${capital.id}` : undefined}
                    onClick={() => setActionsId(actionsId === capital.id ? null : capital.id)}>
                    <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.7" /><circle cx="12" cy="12" r="1.7" /><circle cx="12" cy="19" r="1.7" /></svg>
                  </button>
                  {actionsId === capital.id && <div id={`capital-options-${capital.id}`} className="capital-actions-menu" role="group" aria-label={`Actions for ${capital.name}`}>
                    <button ref={firstAction} type="button" disabled={mutating} onClick={() => { actionsButton.current?.focus(); setActionsId(null); setNotice(""); setEditor({ capital }); }}>Edit</button>
                    <button type="button" className="delete-action" disabled={mutating} onClick={() => { actionsButton.current?.focus(); setActionsId(null); setNotice(""); setDeleting(capital); }}>Delete</button>
                  </div>}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
      {editor && <CapitalForm capital={editor.capital} onCancel={() => setEditor(null)} onSave={async (input, id) => {
        await saveCapital(input, id);
        setNotice(id === undefined ? "Capital created." : "Capital updated.");
      }} />}
      {deleting && <DeleteCapitalDialog capital={deleting} onCancel={() => setDeleting(null)} onDelete={async (id) => {
        await removeCapital(id);
        setNotice("Capital deleted.");
      }} />}
    </aside>
  );
}
