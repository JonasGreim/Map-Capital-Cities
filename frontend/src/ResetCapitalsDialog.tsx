import { useRef, useState } from "react";
import { CapitalDialog } from "./CapitalDialog";

function ResetIcon() {
  return <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M3 11a9 9 0 1 1 2.6 6.4M3 4v7h7" /></svg>;
}

export function ResetCapitalsDialog({ onReset, onReload, onCancel }: {
  onReset: () => Promise<void>;
  onReload: () => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const apiError = useRef<HTMLParagraphElement>(null);
  async function run(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    try { await operation(); onCancel(); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to reset capitals. Reload current data before trying again.");
      requestAnimationFrame(() => apiError.current?.focus());
    } finally { pending.current = false; setBusy(false); }
  }
  return (
    <CapitalDialog title="Reset to default" busy={busy} onClose={onCancel} className="reset-dialog" resumeFocus=".reset-cancel"
      headerIcon={<ResetIcon />}
      description="This will restore all default capital names, countries and coordinates.">
      <ul className="reset-consequences">
        <li>
          <span className="reset-consequence-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7m4-7v7" /></svg></span>
          <span>All manually added capitals will be <strong>deleted.</strong></span>
        </li>
        <li>
          <span className="reset-consequence-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><ellipse cx="12" cy="5" rx="8" ry="3" /><path d="M4 5v14c0 4 16 4 16 0V5M4 12c0 4 16 4 16 0" /></svg></span>
          <span>Deleted default capitals will <strong>return.</strong></span>
        </li>
        <li>
          <span className="reset-consequence-icon" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none"><path d="M21 11a9 9 0 1 0-9 10h1a2 2 0 0 0 1.6-3.2 1.5 1.5 0 0 1 1.2-2.4H17a4 4 0 0 0 4-4.4Z" /><circle cx="7" cy="11" r="0.8" /><circle cx="10" cy="7" r="0.8" /><circle cx="15" cy="7" r="0.8" /><circle cx="17" cy="11" r="0.8" /></svg></span>
          <span>Marker colors will return to <strong>teal</strong> in this browser.</span>
        </li>
      </ul>
      <p className="reset-warning">This changes the shared demo data for everyone and <strong>cannot be undone.</strong></p>
      {error && <p ref={apiError} className="field-error" role="alert" tabIndex={-1}>{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary reset-cancel" autoFocus disabled={busy} onClick={onCancel}>Cancel</button>
        {error
          ? <button type="button" disabled={busy} onClick={() => { void run(onReload); }}>Reload current data</button>
          : <button type="button" className="reset-confirm" disabled={busy} onClick={() => { void run(onReset); }}><ResetIcon /><span>{busy ? "Resetting…" : "Reset capitals"}</span></button>}
      </div>
      {busy && <p role="status">{error ? "Loading capitals…" : "Resetting capitals…"}</p>}
    </CapitalDialog>
  );
}
