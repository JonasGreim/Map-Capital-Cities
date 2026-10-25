import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

// This one menu lives outside the scrolling list so neither edge can clip it.
export function CapitalActionsMenu({ id, name, trigger, hidden, onClose, onEdit, onDelete }: {
  id: number;
  name: string;
  trigger: HTMLButtonElement;
  hidden: boolean;
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = panel.current;
    if (hidden || !menu) { onClose(); return; }
    const anchor = trigger.getBoundingClientRect();
    const bounds = menu.getBoundingClientRect();
    const gutter = 8;
    // Prefer the left of the trigger; clamp both axes on narrow/short screens.
    menu.style.left = `${Math.max(gutter, Math.min(anchor.left - bounds.width - 4, window.innerWidth - bounds.width - gutter))}px`;
    menu.style.top = `${Math.max(gutter, Math.min(anchor.top + (anchor.height - bounds.height) / 2, window.innerHeight - bounds.height - gutter))}px`;
    menu.querySelector("button")?.focus({ preventScroll: true });

    function close(restore = false) {
      if (restore && trigger.isConnected && !trigger.closest("[hidden]")) trigger.focus({ preventScroll: true });
      onClose();
    }
    function outside(event: PointerEvent) {
      if (event.target instanceof Node && !menu!.contains(event.target) && !trigger.contains(event.target)) {
        // Restore only while focus still belongs to the menu. A clicked control
        // receives focus normally after pointerdown.
        close(menu!.contains(document.activeElement));
      }
    }
    function focus(event: FocusEvent) {
      if (event.target instanceof Node && !menu!.contains(event.target) && !trigger.contains(event.target)) close();
    }
    function escape(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      event.preventDefault();
      close(true);
    }
    const moved = () => close(menu.contains(document.activeElement));
    function scrolled() {
      // A click may first scroll its trigger into view and deliver that scroll
      // event after this menu mounts. Ignore it if the anchor has not moved.
      const current = trigger.getBoundingClientRect();
      if (current.top !== anchor.top || current.left !== anchor.left) moved();
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("focusin", focus);
    document.addEventListener("keydown", escape);
    // Close rather than leave a detached overlay when its anchor moves.
    document.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", escape);
      document.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", moved);
    };
  }, [trigger, hidden, onClose]);

  if (hidden) return null;
  return createPortal(
    <div ref={panel} id={`capital-options-${id}`} className="capital-actions-menu" role="group" aria-label={`Actions for ${name}`}
      onKeyDown={(event) => {
        const buttons = panel.current!.querySelectorAll("button");
        if (event.key !== "Tab") return;
        if (event.shiftKey && event.target === buttons[0]) {
          event.preventDefault();
          trigger.focus({ preventScroll: true });
          onClose();
        } else if (!event.shiftKey && event.target === buttons[1]) {
          // Let native Tab continue from the trigger to the next list control.
          trigger.focus({ preventScroll: true });
          onClose();
        }
      }}>
      <button type="button" onClick={() => { trigger.focus({ preventScroll: true }); onClose(); onEdit(); }}>Edit</button>
      <button type="button" className="delete-action" onClick={() => { trigger.focus({ preventScroll: true }); onClose(); onDelete(); }}>Delete</button>
    </div>, document.body,
  );
}
