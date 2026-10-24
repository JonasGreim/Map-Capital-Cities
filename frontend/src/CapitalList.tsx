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
};

export function CapitalList({ capitals, loading, error, onRetry }: CapitalListProps) {
  const results = useRef<HTMLDivElement>(null);
  const retryButton = useRef<HTMLButtonElement>(null);
  const retryPending = useRef(false);
  const { mutating, saveCapital, removeCapital } = useCapitalStore();
  const [editor, setEditor] = useState<{ capital?: Capital } | null>(null);
  const [deleting, setDeleting] = useState<Capital | null>(null);
  const [notice, setNotice] = useState("");

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
      <div className="list-actions">
        <button id="add-capital" type="button" disabled={loading || mutating || !!error} onClick={() => { setNotice(""); setEditor({}); }}>Add capital</button>
        <button type="button" className="secondary" disabled={loading || mutating} onClick={retry}>Refresh list</button>
      </div>
      <p className="mutation-notice" role="status">{notice}</p>
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
                <div className="row-actions">
                  <button type="button" className="secondary" disabled={mutating} aria-label={`Edit ${capital.name}`} onClick={() => { setNotice(""); setEditor({ capital }); }}>Edit</button>
                  <button type="button" className="secondary" disabled={mutating} aria-label={`Delete ${capital.name}`} onClick={() => { setNotice(""); setDeleting(capital); }}>Delete</button>
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
