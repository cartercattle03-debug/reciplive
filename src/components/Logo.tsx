/** The RecipLive letters, drawn as thin strokes like HerdLive's: RECIP in sky blue, LIVE in copper. */
export function Wordmark({ className = "", onDark = false, weight = 12 }: { className?: string; onDark?: boolean; weight?: number }) {
  const recip = onDark ? "#ffffff" : "#0369a1";
  const live = onDark ? "#f4e6d6" : "#b8732e";
  const s = { fill: "none", strokeWidth: weight, strokeLinecap: "butt" as const, strokeLinejoin: "miter" as const };
  return (
    <svg viewBox="118 118 1190 196" className={className} role="img" aria-label="RecipLive">
      <g stroke={recip} {...s}>
        <path d="M134 129V299M134 134H188A42.5 42.5 0 0 1 188 219H134M186 219L228 299" />
        <path d="M290 134H380M290 214H380M290 294H380" />
        <path d="M548 162A86 86 0 1 0 548 266" />
        <path d="M606 129V299" />
        <path d="M666 129V299M666 134H720A42.5 42.5 0 0 1 720 219H666" />
      </g>
      <g stroke={live} {...s}>
        <path d="M838 129V294H916" />
        <path d="M982 129V299" />
        <path d="M1042 128L1098 300L1154 128" />
        <path d="M1210 134H1300M1210 214H1300M1210 294H1300" />
      </g>
    </svg>
  );
}

export function Logo({ large = false, onDark = false }: { large?: boolean; onDark?: boolean }) {
  return (
    <span className="inline-flex flex-col items-center">
      <Wordmark onDark={onDark} weight={large ? 11 : 18} className={large ? "h-14 w-auto" : "h-5 w-auto"} />
      {large && <span className="mt-2 text-[11px] font-extrabold uppercase tracking-[0.3em] text-slate-700">Every recip. Every transfer.</span>}
    </span>
  );
}
