import { useEffect, useState } from "react";

export function CapitalLoadingStatus({ loading, initial }: { loading: boolean; initial: boolean }) {
  // Keep one polite region outside the busy/hidden panes, including on mobile.
  return <div className="capital-loading-status" role="status" aria-live="polite" aria-atomic="true">
    {loading && <LoadingMessage initial={initial} />}
  </div>;
}

function LoadingMessage({ initial }: { initial: boolean }) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!initial) return;
    const timer = setTimeout(() => setSlow(true), 5_000);
    return () => clearTimeout(timer);
  }, [initial]);

  return <>
    <div className="capital-loading-label"><span className="capital-loading-spinner" aria-hidden="true" />
      <span>{initial && slow ? "Still loading capitals…" : "Loading capitals…"}</span></div>
    {initial && slow && <p>This demo uses free hosting. The server may pause when nobody is using it and can take about a minute to wake up.</p>}
  </>;
}
