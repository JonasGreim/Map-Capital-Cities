import { useEffect, useRef, type ReactNode } from "react";

export function CapitalDialog({ title, busy, onClose, children }: {
  title: string;
  busy: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    element.showModal();
    return () => {
      element.close();
      if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true });
      else document.getElementById("add-capital")?.focus({ preventScroll: true });
    };
  }, []);

  return (
    <dialog ref={dialog} className="capital-dialog" aria-labelledby="dialog-title" aria-busy={busy}
      onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }}>
      <h2 id="dialog-title">{title}</h2>
      {children}
    </dialog>
  );
}
