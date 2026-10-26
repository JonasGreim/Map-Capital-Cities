import { useEffect, useRef, type ReactNode } from "react";

export function CapitalDialog({ title, busy, onClose, children, suspended = false, resumeFocus, headerIcon, description, className }: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  suspended?: boolean;
  resumeFocus?: string;
  headerIcon?: ReactNode;
  description?: string;
  className?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    return () => {
      element.close();
      // Reconcile the confirmed mutation first: a popup trigger may disappear
      // after deletion or a country edit that excludes it from the filter.
      queueMicrotask(() => {
        const usable = (target: Element | null): target is HTMLElement => target instanceof HTMLElement
          && target.isConnected && !target.closest("[hidden], [inert]") && !target.matches(":disabled")
          && target.getClientRects().length > 0;
        const target = [previous, document.getElementById("add-capital"), document.querySelector(".mapboxgl-canvas"),
          document.getElementById("world-map")].find(usable);
        target?.focus({ preventScroll: true });
      });
    };
  }, []);
  useEffect(() => {
    const element = dialog.current!;
    // Closing removes the native modal/inert layer; keep the form mounted.
    if (suspended) element.close();
    else {
      if (!element.open) element.showModal();
      const target = element.querySelector<HTMLElement>(resumeFocus ?? "input");
      (target?.matches(":disabled") ? element.querySelector<HTMLInputElement>('[name="latitude"]') : target)?.focus({ preventScroll: true });
    }
  }, [suspended, resumeFocus]);

  return (
    <dialog ref={dialog} className={`capital-dialog${headerIcon ? " capital-editor" : ""}${className ? ` ${className}` : ""}`} aria-labelledby="dialog-title" aria-busy={busy}
      aria-describedby={description ? "dialog-description" : undefined}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      {headerIcon ? <header className="capital-editor-header">
        <span className="capital-editor-icon" aria-hidden="true">{headerIcon}</span>
        <h2 id="dialog-title">{title}</h2>
        <button type="button" className="secondary dialog-close" aria-label="Close dialog" disabled={busy} onClick={onClose}>
          <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m2 2 20 20M2 22 22 2" /></svg>
        </button>
      </header> : <h2 id="dialog-title">{title}</h2>}
      {description && <p id="dialog-description" className="capital-editor-description">{description}</p>}
      {children}
    </dialog>
  );
}
