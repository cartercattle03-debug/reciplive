import type { Cell } from "@/components/Table";
import { familyKey, showDate, showRate, type Calc } from "./recip";

/** Shared cell builders, so every page shows a Cow ID, a status or a date the same way. */
export const cowCell = (id: string): Cell => {
  const k = familyKey(id);
  return { t: id, s: k[0] ? `1|${k[1]}|${String(k[2]).padStart(3, "0")}|${String(k[3]).padStart(15, "0")}` : `0|${k[4]}`, href: `/lookup?cow=${encodeURIComponent(id)}` };
};
export const statusCell = (s: string): Cell => ({ t: s, cls: s ? `st-${s.replace(/\s/g, "")}` : "" });
export const dateCell = (d: string | null): Cell => ({ t: showDate(d), s: d ?? "" });
export const numCell = (n: number | null | undefined): Cell => ({ t: n === null || n === undefined ? "" : String(n), s: n ?? "" });
export const rateCell = (r: number | null): Cell => ({ t: showRate(r), s: r ?? -1 });
export const textCell = (t: string): Cell => ({ t });
export const money = (n: number | null) => (n === null || n === undefined ? "" : "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

/** Batch sorts by its place in time, not its letters. */
export const batchCell = (c: Calc): Cell => ({ t: c.batch, s: c.batchOrder });
