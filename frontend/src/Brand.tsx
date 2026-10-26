export function Brand({ compact = false }: { compact?: boolean }) {
  return <a className="brand-link" href="/" aria-label="Map Capital Cities – Home">
    <svg className="brand-globe" viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="21" /><ellipse cx="24" cy="24" rx="10" ry="21" /><path d="M3 24h42M7 12h34M7 36h34" /></svg>
    <div className={compact ? "visually-hidden" : undefined}>
      <h1>Map Capital Cities</h1>
      <p>Discover countries and their capitals around the world.</p>
    </div>
  </a>;
}
