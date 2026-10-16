"use client";

/** A row of tick boxes inside a FilterForm (none ticked = all). */
export function Checks({ name, label, options, on, labels, bold, one }: { name: string; label: string; options: string[]; on: string[]; /** What each choice reads as, if not its value. */ labels?: Record<string, string>; /** Bigger, bolder - the customer's filter bar. */ bold?: boolean; /** Pick one (Sort by), not several. */ one?: boolean }) {
  return (
    <fieldset className={bold ? "text-sm" : "text-xs"}>
      <legend className={bold ? "mb-1 text-sm font-bold uppercase tracking-wide text-brand-700" : "mb-1 font-medium text-slate-600"}>{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label
            key={o}
            className={
              "flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 " +
              (bold ? "border-2 font-semibold " : "") +
              (on.includes(o) ? (bold ? "border-brand-600 bg-brand-600 text-white" : "border-brand-600 bg-brand-50 text-brand-700") : bold ? "border-slate-400 bg-white text-slate-800" : "border-slate-300 bg-white text-slate-700")
            }
          >
            <input type={one ? "radio" : "checkbox"} name={name} value={o} defaultChecked={on.includes(o)} className={bold ? "accent-white" : "accent-brand-600"} />
            {labels?.[o] ?? o}
          </label>
        ))}
      </div>
    </fieldset>
  );
}

export function PrintButton({ label = "Print / Save PDF" }: { label?: string }) {
  return (
    <button type="button" className="btn edit-only" onClick={() => window.print()}>
      {label}
    </button>
  );
}
