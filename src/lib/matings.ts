import { countsOf, type Calc, type Counts } from "./recip";

/**
 * A customer's results by mating, by sire, or by donor (Carter, 2026-10-15): for the customer to see whether a mating is
 * or isn't getting cows pregnant - and so costing them. Matings are written "Sire x Donor"; spellings that differ only
 * in spaces, slashes, dots or dashes ("91/Z" = "91Z") are one. A Pass (no transfer) never counts.
 */
export type MateBy = "mating" | "sire" | "donor";
export const MATE_LABELS: Record<MateBy, string> = { mating: "Mating", sire: "Sire", donor: "Donor" };
/** Fewer checked than this and the rate isn't shown - one or two cows can't say how a mating does (Carter, 2026-10-15). */
export const MIN_CHECKED = 3;

const loose = (s: string) => s.toLowerCase().replace(/[\s/.\-]/g, "");

/** "Me Too x 9003" -> sire "Me Too", donor "9003". No " x " -> it's all sire. */
export function splitMating(m: string): { sire: string; donor: string } {
  const t = (m ?? "").trim();
  const i = t.search(/\s+x\s+/i);
  if (i < 0) return { sire: t, donor: "" };
  const rest = t.slice(i).replace(/^\s+x\s+/i, "");
  return { sire: t.slice(0, i).trim(), donor: rest.trim() };
}

const partOf = (c: Calc, by: MateBy) => (by === "mating" ? (c.mating ?? "").trim() : splitMating(c.mating)[by]);

export type MateRow = Counts & { value: string; checked: number; hits: number; showRate: boolean };

export function mateBreakdown(calc: Calc[], by: MateBy): { rows: MateRow[]; total: MateRow } {
  const live = calc.filter((c) => c.outcome !== "Pass");
  const groups = new Map<string, { names: Map<string, number>; cows: Calc[] }>();
  for (const c of live) {
    const name = partOf(c, by);
    const key = name ? loose(name) : "";
    if (!groups.has(key)) groups.set(key, { names: new Map(), cows: [] });
    const g = groups.get(key)!;
    g.cows.push(c);
    if (name) g.names.set(name, (g.names.get(name) ?? 0) + 1);
  }
  const row = (value: string, cows: Calc[]): MateRow => {
    const k = countsOf(cows);
    const checked = k.safe + k.probable + k.open;
    return { ...k, value, checked, hits: k.safe + k.probable, showRate: checked >= MIN_CHECKED };
  };
  const rows = [...groups.entries()].map(([key, g]) => {
    // The spelling used most is the one shown.
    const name = key ? [...g.names.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0][0] : "(not recorded)";
    return row(name, g.cows);
  });
  rows.sort((a, b) => (a.value === "(not recorded)" ? 1 : 0) - (b.value === "(not recorded)" ? 1 : 0) || b.total - a.total || a.value.localeCompare(b.value, undefined, { numeric: true }));
  const total = row("TOTAL", live);
  return { rows, total: { ...total, showRate: total.checked > 0 } };
}
