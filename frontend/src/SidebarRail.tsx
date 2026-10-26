import { useCallback, useRef, useState } from "react";
import type { Capital } from "./api";
import { Brand } from "./Brand";
import { useCapitalActions } from "./CapitalActions";
import { CapitalSearchPopover } from "./CapitalSearchPopover";
import { useCapitalStore } from "./capital-store";

export function SidebarRail({ query, onQuery, capitals, total, loading, error, onSelect, onRetry, onExpand }: {
  query: string;
  onQuery: (query: string) => void;
  capitals: Capital[];
  total: number;
  loading: boolean;
  error: string | null;
  onSelect: (capital: Capital) => void;
  onRetry: () => Promise<void>;
  onExpand: () => void;
}) {
  // Only transient UI belongs to the rail. Query, filter and list scroll remain
  // in the mounted CapitalList when this component disappears on expand/mobile.
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const closeSearch = useCallback(() => setSearchOpen(false), []);
  const { closeActions, createCapital, picking } = useCapitalActions();
  const mutating = useCapitalStore(state => state.mutating);
  return <nav className="sidebar-rail" aria-label="Capital shortcuts">
    <header className="app-header"><Brand compact /></header>
    <button ref={searchTrigger} type="button" className="rail-action" aria-label="Search capitals" title="Search capitals" aria-expanded={searchOpen} aria-controls={searchOpen ? "capital-search-popover" : undefined} aria-haspopup="dialog"
      onClick={() => { closeActions(); setSearchOpen(open => !open); }}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m16 16 5 5" /></svg>
    </button>
    <button type="button" className="rail-action" aria-label="Add capital" title="Add capital" disabled={loading || mutating || !!error || picking} onClick={createCapital}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 4v16M4 12h16" /></svg>
    </button>
    <button type="button" className="rail-action" aria-label="Show capital list" title="Show capital list" aria-controls="capital-sidebar" aria-expanded={false} onClick={onExpand}>
      <svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 21V3c5-4 9 4 14 0v11c-5 4-9-4-14 0" /></svg>
    </button>
    {searchOpen && <CapitalSearchPopover query={query} onQuery={onQuery} capitals={capitals} total={total} loading={loading} error={error} picking={picking}
      trigger={searchTrigger} onClose={closeSearch} onRetry={onRetry} onSelect={capital => { closeSearch(); onSelect(capital); }} />}
  </nav>;
}
