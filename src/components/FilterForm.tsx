"use client";

/** A filter row that applies itself as soon as a choice changes (no Search button needed). */
export function FilterForm({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <form method="get" className={"no-print mb-3 flex flex-wrap items-end gap-3 " + className} onChange={(e) => e.currentTarget.requestSubmit()}>
      {children}
    </form>
  );
}

export function Pick({ name, label, value, options, all = "All" }: { name: string; label: string; value: string; options: string[]; all?: string | null }) {
  return (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <select name={name} defaultValue={value} className="field mt-0.5 w-auto min-w-[8rem]">
        {all !== null && <option value="">{all}</option>}
        {options.map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  );
}
