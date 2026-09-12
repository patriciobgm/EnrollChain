export function LoadingState({
  label = "Loading…",
  rows = 3,
}: {
  label?: string;
  rows?: number;
}) {
  return (
    <div role="status" aria-live="polite" className="space-y-4 py-3">
      <span className="sr-only">{label}</span>
      <div aria-hidden="true" className="space-y-4">
        {Array.from({ length: rows }, (_, index) => (
          <div
            key={index}
            className="panel space-y-3 motion-safe:animate-pulse"
          >
            <div className="h-4 w-2/5 rounded bg-line/70" />
            <div className="h-3 w-3/4 rounded bg-line/50" />
          </div>
        ))}
      </div>
    </div>
  );
}
