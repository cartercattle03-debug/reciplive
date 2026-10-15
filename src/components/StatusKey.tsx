/** What each status means, in words (Carter, 2026-10-15): Probable = first preg check, Safe = final preg check. */
export function StatusKey({ className = "" }: { className?: string }) {
  return (
    <p className={"text-sm text-slate-700 " + className}>
      <b className="st-Probable">Probable</b> = pregnant at the first preg check (about 42 days) ·{" "}
      <b className="st-Safe">Safe</b> = confirmed pregnant at the final preg check (75 days) ·{" "}
      <b className="st-Open">Open</b> = not pregnant · <b className="st-Pending">Pending</b> = not checked yet
    </p>
  );
}
