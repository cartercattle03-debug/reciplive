// Shown the moment a tab is tapped, while the page is fetched (Carter, 2026-11-24: speed) - the menu and header stay put.
export default function Loading() {
  return (
    <div className="animate-pulse" aria-busy="true" aria-label="Loading">
      <div className="mb-2 h-7 w-56 rounded bg-slate-200" />
      <div className="mb-6 h-4 w-96 max-w-full rounded bg-slate-100" />
      <div className="card p-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="mb-3 h-5 rounded bg-slate-100" />
        ))}
      </div>
    </div>
  );
}
