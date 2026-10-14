"use client";
import { useRouter } from "next/navigation";

/** The Year box: which year the pages show (kept on this device). A new year is there to start a fresh slate. */
export function YearPick({ year, years }: { year: number; years: number[] }) {
  const router = useRouter();
  return (
    <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-600">
      Year
      <select
        className="field w-auto py-1 font-semibold text-brand-700"
        value={year}
        onChange={(e) => {
          document.cookie = `rl_year=${e.target.value}; path=/; max-age=${60 * 60 * 24 * 400}; samesite=lax`;
          router.refresh();
        }}
      >
        {years.map((y) => (
          <option key={y} value={y}>
            {y}
          </option>
        ))}
      </select>
    </label>
  );
}
