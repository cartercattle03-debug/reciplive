"use client";

/** A row of tick boxes inside a FilterForm (none ticked = all). */
export function Checks({ name, label, options, on }: { name: string; label: string; options: string[]; on: string[] }) {
  return (
    <fieldset className="text-xs">
      <legend className="mb-1 font-medium text-slate-600">{label}</legend>
      <div className="flex flex-wrap gap-1.5">
        {options.map((o) => (
          <label key={o} className={"flex cursor-pointer items-center gap-1 rounded-full border px-2.5 py-1 " + (on.includes(o) ? "border-brand-600 bg-brand-50 text-brand-700" : "border-slate-300 bg-white text-slate-700")}>
            <input type="checkbox" name={name} value={o} defaultChecked={on.includes(o)} className="accent-brand-600" />
            {o}
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
