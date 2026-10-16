import { StatusKey } from "./StatusKey";
import { Table, type Row } from "./Table";
import { batchCell, cowCell, dateCell } from "@/lib/cells";
import { countsOf, customerSearch, shownStatus, showDate, showRate, type Calc, type CustomerFilter } from "@/lib/recip";
import { Logo } from "./Logo";

export const METRICS = ["Total Transferred", "75-Day Confirmed", "Currently Probable", "Pregnancy Rate"] as const;

/** One owner's herd summary: the cards they picked, then their cows. Prints clean on one letter page width. */
export function CustomerReport({ calc, f, show, ranch, today, linkCows = true, bar, dateOf }: { calc: Calc[]; f: CustomerFilter; show: string[]; ranch: string; today: string; linkCows?: boolean; /** The customer's page: Sort by, shown above the tip. */ bar?: React.ReactNode; /** The customer's page: a group reads as its transfer date. */ dateOf?: (batch: string) => string }) {
  // A customer sees Transfer Date, not the group label (Carter, 2026-10-16) - the label is just the date written short.
  const customer = !linkCows;
  const r = customerSearch(calc, f);
  const val: Record<string, string> = {
    "Total Transferred": String(r.totalTransferred),
    "75-Day Confirmed": String(r.confirmed75),
    "Currently Probable": String(r.currentlyProbable),
    "Pregnancy Rate": showRate(r.rate),
  };
  // Transferred and pregnancy rate for each transfer date on their list, oldest first (Pass lines aren't transfers).
  const byDate = [...new Set(r.rows.map((c) => c.batch))]
    .map((batch) => ({ batch, order: r.rows.find((c) => c.batch === batch)!.batchOrder, k: countsOf(r.rows.filter((c) => c.batch === batch && c.outcome !== "Pass")) }))
    .filter((d) => d.batch && d.k.total)
    .sort((a, b) => a.order - b.order);
  const rows: Row[] = r.rows.map((c) => ({
    key: c.id,
    cells: [linkCows ? cowCell(c.cowId) : { t: c.cowId }, ...(customer ? [] : [batchCell(c)]), dateCell(c.transferDate), { t: c.mating }, { t: c.embryoType }, { t: c.grade }, { t: c.company }, { t: shownStatus(c), cls: c.status ? `st-${shownStatus(c)}` : "" }, dateCell(c.status === "Safe" || c.status === "Probable" ? c.dueDate : null)],
  }));
  return (
    <div>
      <div className="print-only mb-4">
        <div className="flex items-end justify-between border-b-2 border-brand-600 pb-2">
          <div>
            <div className="text-lg font-bold text-brand-700">{f.owner} - Herd Summary</div>
            <div className="text-xs text-slate-600">
              {ranch} · {showDate(today)}
              {f.batches.length ? (customer && dateOf ? ` · Transferred ${f.batches.map(dateOf).join(", ")}` : ` · Groups ${f.batches.join(", ")}`) : ""}
              {f.statuses.length ? ` · ${f.statuses.join(", ")}` : ""}
            </div>
          </div>
          <Logo />
        </div>
      </div>
      {show.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-3">
          {METRICS.filter((k) => show.includes(k)).map((k) => (
            <div key={k} className="stat bg-brand-50">
              <b>{val[k]}</b>
              <span>{k}</span>
            </div>
          ))}
        </div>
      )}
      {/* More than one transfer date on their list: a card for each - how many went in, and how that date's doing. */}
      {customer && dateOf && byDate.length > 1 && (
        <div className="mb-4">
          <div className="mb-1 text-xs font-bold uppercase tracking-wide text-brand-700">By transfer date</div>
          <div className="flex flex-wrap gap-2">
            {byDate.map((d) => (
              <div key={d.batch} className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-center shadow-sm">
                <div className="text-sm font-bold text-slate-800">{dateOf(d.batch)}</div>
                <div className="text-xs text-slate-600">{d.k.total} transferred</div>
                <div className="text-base font-bold text-brand-700">{showRate(d.k.rate)}</div>
                <div className="text-[11px] text-slate-500">pregnancy rate</div>
              </div>
            ))}
          </div>
        </div>
      )}
      {/* The customer's Sort by / Transfer Date / Status / Show, in one bold bar over their list (Carter, 2026-10-16). */}
      {bar}
      {!linkCows && (
        <div className="no-print mb-3 flex items-center gap-2 rounded-md border-l-4 border-rust bg-amber-50 px-4 py-2.5 text-sm font-semibold text-slate-800">
          <span className="text-lg text-rust" aria-hidden>⇅</span>
          Tip: click any column heading (Cow ID, Transfer Date, Mating, Status, Due Date...) to sort the list by that column. Click it again to flip the order.
        </div>
      )}
      <StatusKey className="mb-3" />
      <Table cols={[{ label: "Cow ID" }, ...(customer ? [] : [{ label: "Batch" }]), { label: "Transfer Date" }, { label: "Mating" }, { label: "Embryo Type" }, { label: "Grade" }, { label: "Company" }, { label: "Status" }, { label: "Due Date" }]} rows={rows} empty="No cows match." />
    </div>
  );
}
