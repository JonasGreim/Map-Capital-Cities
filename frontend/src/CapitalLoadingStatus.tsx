import { useEffect, useState } from "react";

export function CapitalLoadingStatus({ loading, initial, error, onRetry }: {
  loading: boolean;
  initial: boolean;
  error: string | null;
  onRetry: () => Promise<void>;
}) {
  // Keep one polite region outside the busy/hidden panes, including on mobile.
  return <>
    <div className="capital-loading-status" role="status" aria-live="polite" aria-atomic="true">
      {loading && <LoadingMessage initial={initial} />}
    </div>
    {!loading && error && <div className="capital-load-error">
      <p id="capital-load-error-message" role="alert">{error}</p>
      <button type="button" aria-describedby="capital-load-error-message" onClick={() => { void onRetry(); }}>Try again</button>
    </div>}
  </>;
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
