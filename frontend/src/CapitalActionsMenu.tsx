import { useLayoutEffect, useRef } from "react";
import { createPortal } from "react-dom";

// Shared by list rows and the active popup; the portal avoids clipping at edges.
export function CapitalActionsMenu({ id, name, trigger, hidden, placement = "beside", onClose, onEdit, onDelete }: {
  id: number;
  name: string;
  trigger: HTMLButtonElement;
  hidden: boolean;
  placement?: "beside" | "below";
  onClose: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const panel = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const menu = panel.current;
    if (hidden || !menu) { onClose(); return; }
    trigger.setAttribute("aria-expanded", "true");
    trigger.setAttribute("aria-controls", `capital-options-${id}`);
    const anchor = trigger.getBoundingClientRect();
    const bounds = menu.getBoundingClientRect();
    const gutter = 8;
    // List menus sit beside their row; popup menus open below the header.
    // Clamp both axes, flipping above a popup trigger when space is short.
    const left = placement === "below" ? anchor.right - bounds.width : anchor.left - bounds.width - 4;
    const top = placement === "below"
      ? (anchor.bottom + bounds.height + gutter <= window.innerHeight ? anchor.bottom + 4 : anchor.top - bounds.height - 4)
      : anchor.top + (anchor.height - bounds.height) / 2;
    menu.style.left = `${Math.max(gutter, Math.min(left, window.innerWidth - bounds.width - gutter))}px`;
    menu.style.top = `${Math.max(gutter, Math.min(top, window.innerHeight - bounds.height - gutter))}px`;
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
      event.stopPropagation();
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
    // Capture before the popup's Escape handler: close only this menu first.
    document.addEventListener("keydown", escape, true);
    // Close rather than leave a detached overlay when its anchor moves.
    document.addEventListener("scroll", scrolled, true);
    window.addEventListener("resize", moved);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("focusin", focus);
      document.removeEventListener("keydown", escape, true);
      document.removeEventListener("scroll", scrolled, true);
      window.removeEventListener("resize", moved);
      trigger.setAttribute("aria-expanded", "false");
      trigger.removeAttribute("aria-controls");
    };
  }, [id, trigger, hidden, placement, onClose]);

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
