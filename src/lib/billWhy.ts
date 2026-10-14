import { showDate, type Calc } from "./recip";

/** Plain-words answer to "why isn't this cow on Ready to bill?" - one line per record she has. */
export function whyNotBillable(calc: Calc[], cowId: string, billed: Map<string, number>, events: { cowId: string; kind: string; date: string; transferId: string | null }[]): string[] {
  const id = cowId.trim().toLowerCase();
  const mine = calc.filter((c) => c.cowId.toLowerCase() === id).sort((a, b) => a.attemptNo - b.attemptNo);
  if (!mine.length) return [`No records for Cow ID ${cowId}. Check the spelling (054 is not 54).`];
  return mine.map((c) => {
    const head = `${c.batch || "(no group)"} · ${c.owner || "no owner"} · ${c.mating || "no mating"}:`;
    const last = c.checks[c.checks.length - 1];
    const checks = c.checks.length ? ` Preg checks: ${c.checks.map((a) => `${a.result} ${showDate(a.checkDate)}`).join(", ")}.` : " No preg checks on file for this record.";
    const inv = billed.get(c.id);
    if (inv) return `${head} on invoice #${inv} - already billed.${checks}`;
    if (c.status === "Culled") {
      const cull = events.find((e) => e.kind === "Culled" && e.transferId === c.id);
      return `${head} Culled${cull ? ` on ${showDate(cull.date)}` : ""} - a culled cow counts as a failed pregnancy and is never billed.${checks}${last?.result === "Safe" ? " Her last check was Safe: if she was culled by mistake, set her Status back to Safe on Transfers." : ""}`;
    }
    if (c.status === "Safe") return `${head} Safe - she should be on Ready to bill (clear any Owner / Group filter).${checks}`;
    return `${head} her record says ${c.status || "(blank)"}, not Safe - only Safe (75-day confirmed) records bill.${checks}${last?.result === "Safe" ? " Her last check was Safe: use the yellow card to fix her, or set her Status to Safe on Transfers." : ""}`;
  });
}
