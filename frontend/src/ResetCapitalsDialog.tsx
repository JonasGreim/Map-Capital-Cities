import { useRef, useState } from "react";
import { CapitalDialog } from "./CapitalDialog";

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
    <CapitalDialog title="Reset to default" busy={busy} onClose={onCancel}>
      <p>Restore all default capital names, countries and coordinates? Deleted default capitals will return and all manually added capitals will be deleted.</p>
      <p>This changes the shared demo data for everyone. Capitals receive new IDs. The selection and popup will close, and all marker colors in this session will return to Teal. This cannot be undone.</p>
      {error && <p ref={apiError} className="field-error" role="alert" tabIndex={-1}>{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary" autoFocus disabled={busy} onClick={onCancel}>Cancel</button>
        {error
          ? <button type="button" disabled={busy} onClick={() => { void run(onReload); }}>Reload current data</button>
          : <button type="button" disabled={busy} onClick={() => { void run(onReset); }}>{busy ? "Resetting…" : "Reset capitals"}</button>}
      </div>
      {busy && <p role="status">{error ? "Loading capitals…" : "Resetting capitals…"}</p>}
    </CapitalDialog>
  );
}
