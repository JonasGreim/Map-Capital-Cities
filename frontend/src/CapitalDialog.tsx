import { useEffect, useRef, type ReactNode } from "react";

export function CapitalDialog({ title, busy, onClose, children, suspended = false, resumeFocus }: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
  suspended?: boolean;
  resumeFocus?: string;
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
      if (resumeFocus) {
        const target = element.querySelector<HTMLElement>(resumeFocus);
        (target?.matches(":disabled") ? element.querySelector<HTMLInputElement>('[name="latitude"]') : target)?.focus({ preventScroll: true });
      }
    }
  }, [suspended, resumeFocus]);

  return (
    <dialog ref={dialog} className="capital-dialog" aria-labelledby="dialog-title" aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <h2 id="dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
