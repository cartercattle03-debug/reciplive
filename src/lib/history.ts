import { cowHistory, showDate, type Calc } from "./recip";

/** The cow snapshot as plain lines - the hover note on Open Inventory. */
export function historyNote(calc: Calc[], cowId: string): string {
  const h = cowHistory(calc, cowId);
  if (!h.length) return "";
  const last = h[h.length - 1];
  const lines = [`Cow ${cowId} - Lifetime Attempts: ${h.length} | Times Probable: ${last.timesProbable} | Times Passed: ${last.timesPassed}`];
  h.forEach((r, i) => lines.push(`#${i + 1} ${showDate(r.transferDate)} | ${r.embryoType || "-"} | Grade ${r.grade || "-"} | ${r.status || "-"}${r.notes ? ` | Note: ${r.notes}` : ""}`));
  return lines.join("\n");
}
