import { useEffect, useRef, useState } from "react";
import type { Capital } from "./api";
import { CapitalDialog } from "./CapitalDialog";

export function DeleteCapitalDialog({ capital, onDelete, onCancel }: {
  capital: Capital;
  onDelete: (id: number) => Promise<void>;
  onCancel: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pending = useRef(false);
  const apiError = useRef<HTMLParagraphElement>(null);
  useEffect(() => { if (error && !busy) apiError.current?.focus(); }, [error, busy]);
  async function remove() {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError(null);
    try { await onDelete(capital.id); onCancel(); }
    catch (failure) {
      setError(failure instanceof Error ? failure.message : "Unable to delete the capital. Please try again.");
    } finally { pending.current = false; setBusy(false); }
  }
  return (
    <CapitalDialog title="Delete capital" busy={busy} onClose={onCancel}>
      <p>Delete {capital.name}, {capital.country}?</p>
      {error && <p ref={apiError} className="field-error" role="alert" tabIndex={-1}>{error}</p>}
      <div className="dialog-actions">
        <button type="button" className="secondary" disabled={busy} onClick={onCancel}>Cancel</button>
        <button type="button" disabled={busy} onClick={() => { void remove(); }}>{busy ? "Deleting…" : "Delete capital"}</button>
      </div>
      {busy && <p role="status">Deleting capital…</p>}
    </CapitalDialog>
  );
}
