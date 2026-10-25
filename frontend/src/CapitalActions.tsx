import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import type { Capital } from "./api";
import { CapitalActionsMenu } from "./CapitalActionsMenu";
import { CapitalForm } from "./CapitalForm";
import { DeleteCapitalDialog } from "./DeleteCapitalDialog";
import { useCapitalStore } from "./capital-store";
import type { PickedCoordinates } from "./coordinate-picker";

export type PickRequest = { onPick: (coordinates: PickedCoordinates) => void; onCancel: () => void };

type Actions = { capital: Capital; trigger: HTMLButtonElement };
type Dialog = { kind: "edit"; capital?: Capital } | { kind: "delete"; capital: Capital };
const Context = createContext<{
  actions: Actions | null;
  toggleActions: (capital: Capital, trigger: HTMLButtonElement) => void;
  closeActions: (trigger?: HTMLButtonElement) => void;
  createCapital: () => void;
  setNotice: (notice: string) => void;
  picking: boolean;
  preview: PickedCoordinates | null;
  mapAvailable: boolean;
  setMapAvailable: (available: boolean) => void;
  startPick: (request: PickRequest) => void;
  finishPick: (coordinates: PickedCoordinates) => void;
  cancelPick: () => void;
  clearPreview: () => void;
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
  const [picking, setPicking] = useState(false);
  const [preview, setPreview] = useState<PickedCoordinates | null>(null);
  const [mapAvailable, setAvailable] = useState(false);
  const available = useRef(false);
  const request = useRef<PickRequest | null>(null);
  const { capitals, loading, mutating, saveCapital, removeCapital } = useCapitalStore();
  const resetVersion = useCapitalStore(state => state.resetVersion);
  const clearPreview = useCallback(() => setPreview(null), []);
  const clearPick = useCallback(() => { request.current = null; setPicking(false); setPreview(null); }, []);
  const cancelPick = useCallback(() => {
    const current = request.current;
    request.current = null;
    setPicking(false);
    setPreview(null);
    current?.onCancel();
  }, []);
  const setMapAvailable = useCallback((value: boolean) => {
    available.current = value;
    setAvailable(value);
    if (!value) cancelPick();
  }, [cancelPick]);
  const startPick = useCallback((value: PickRequest) => {
    const state = useCapitalStore.getState();
    if (!available.current || request.current || state.loading || state.mutating) return;
    request.current = value;
    setActions(null);
    setPreview(null);
    setPicking(true);
  }, []);
  const finishPick = useCallback((coordinates: PickedCoordinates) => {
    const current = request.current;
    if (!current) return;
    request.current = null;
    current.onPick(coordinates);
    setPreview(coordinates);
    setPicking(false);
  }, []);
  const closeDialog = useCallback(() => { clearPick(); setDialog(null); }, [clearPick]);
  const closeActions = useCallback((trigger?: HTMLButtonElement) => {
    setActions(current => !trigger || current?.trigger === trigger ? null : current);
  }, []);
  const toggleActions = useCallback((capital: Capital, trigger: HTMLButtonElement) => {
    if (request.current || useCapitalStore.getState().mutating || useCapitalStore.getState().loading) return;
    setActions(current => current?.trigger === trigger ? null : { capital, trigger });
  }, []);
  const createCapital = useCallback(() => { clearPick(); setActions(null); setNotice(""); setDialog({ kind: "edit" }); }, [clearPick]);
  useEffect(() => {
    // A reset ends the action. An externally removed edit target clears picking
    // but retains the existing editor/draft and its normal 404 recovery path.
    const unsubscribe = useCapitalStore.subscribe((state, previous) => {
      if (state.resetVersion !== previous.resetVersion) closeDialog();
      else if (dialog?.kind === "edit" && dialog.capital
        && !state.capitals.some(capital => capital.id === dialog.capital?.id)) cancelPick();
    });
    return unsubscribe;
  }, [dialog, closeDialog, cancelPick]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const capital = capitals.find(capital => capital.id === actions?.capital.id);

  return <Context.Provider value={{ actions, toggleActions, closeActions, createCapital, setNotice,
    picking, preview, mapAvailable, setMapAvailable, startPick, finishPick, cancelPick, clearPreview }}>
    {children}
    <p className="mutation-notice" role="status" aria-live="polite" aria-atomic="true">{notice}</p>
    {actions && <CapitalActionsMenu id={actions.capital.id} name={capital?.name ?? actions.capital.name} trigger={actions.trigger}
      placement={actions.trigger.closest(".capital-popup") ? "below" : "beside"}
      hidden={loading || mutating || !capital || !actions.trigger.isConnected || !!actions.trigger.closest("[hidden]")}
      onClose={closeActions}
      onEdit={() => { if (capital) { clearPick(); setNotice(""); setDialog({ kind: "edit", capital }); } }}
      onDelete={() => { if (capital) { clearPick(); setNotice(""); setDialog({ kind: "delete", capital }); } }} />}
    {dialog?.kind === "edit" && <CapitalForm key={`${resetVersion}-${dialog.capital?.id ?? "new"}`} capital={dialog.capital}
      picker={{ available: mapAvailable, active: picking, disabled: loading || mutating, start: startPick, clearPreview }}
      onCancel={closeDialog} onSave={async (input, id) => {
      await saveCapital(input, id);
      setNotice(id === undefined ? "Capital created." : "Capital updated.");
    }} />}
    {dialog?.kind === "delete" && <DeleteCapitalDialog capital={dialog.capital} onCancel={closeDialog} onDelete={async id => {
      await removeCapital(id);
      setNotice("Capital deleted.");
    }} />}
  </Context.Provider>;
}
