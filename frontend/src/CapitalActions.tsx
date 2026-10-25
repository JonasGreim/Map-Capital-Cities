import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import type { Capital } from "./api";
import { CapitalActionsMenu } from "./CapitalActionsMenu";
import { CapitalForm } from "./CapitalForm";
import { DeleteCapitalDialog } from "./DeleteCapitalDialog";
import { useCapitalStore } from "./capital-store";

type Actions = { capital: Capital; trigger: HTMLButtonElement };
type Dialog = { kind: "edit"; capital?: Capital } | { kind: "delete"; capital: Capital };
const Context = createContext<{
  actions: Actions | null;
  toggleActions: (capital: Capital, trigger: HTMLButtonElement) => void;
  closeActions: (trigger?: HTMLButtonElement) => void;
  createCapital: () => void;
  setNotice: (notice: string) => void;
} | null>(null);

export function useCapitalActions() {
  const actions = useContext(Context);
  if (!actions) throw new Error("Capital actions require CapitalActions");
  return actions;
}

// One menu and one CRUD dialog owner, outside the collapsible sidebar. Both
// entry points use the existing forms, store mutations and success feedback.
export function CapitalActions({ children }: { children: ReactNode }) {
  const [actions, setActions] = useState<Actions | null>(null);
  const [dialog, setDialog] = useState<Dialog | null>(null);
  const [notice, setNotice] = useState("");
  const { capitals, loading, mutating, saveCapital, removeCapital } = useCapitalStore();
  const closeActions = useCallback((trigger?: HTMLButtonElement) => {
    setActions(current => !trigger || current?.trigger === trigger ? null : current);
  }, []);
  const toggleActions = useCallback((capital: Capital, trigger: HTMLButtonElement) => {
    if (useCapitalStore.getState().mutating || useCapitalStore.getState().loading) return;
    setActions(current => current?.trigger === trigger ? null : { capital, trigger });
  }, []);
  const createCapital = useCallback(() => { setActions(null); setNotice(""); setDialog({ kind: "edit" }); }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const capital = capitals.find(capital => capital.id === actions?.capital.id);

  return <Context.Provider value={{ actions, toggleActions, closeActions, createCapital, setNotice }}>
    {children}
    <p className="mutation-notice" role="status" aria-live="polite" aria-atomic="true">{notice}</p>
    {actions && <CapitalActionsMenu id={actions.capital.id} name={capital?.name ?? actions.capital.name} trigger={actions.trigger}
      placement={actions.trigger.closest(".capital-popup") ? "below" : "beside"}
      hidden={loading || mutating || !capital || !actions.trigger.isConnected || !!actions.trigger.closest("[hidden]")}
      onClose={closeActions}
      onEdit={() => { if (capital) { setNotice(""); setDialog({ kind: "edit", capital }); } }}
      onDelete={() => { if (capital) { setNotice(""); setDialog({ kind: "delete", capital }); } }} />}
    {dialog?.kind === "edit" && <CapitalForm capital={dialog.capital} onCancel={() => setDialog(null)} onSave={async (input, id) => {
      await saveCapital(input, id);
      setNotice(id === undefined ? "Capital created." : "Capital updated.");
    }} />}
    {dialog?.kind === "delete" && <DeleteCapitalDialog capital={dialog.capital} onCancel={() => setDialog(null)} onDelete={async id => {
      await removeCapital(id);
      setNotice("Capital deleted.");
    }} />}
  </Context.Provider>;
}
