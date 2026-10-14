import { Table, type Row } from "./Table";
import { batchCell, cowCell, dateCell } from "@/lib/cells";
import { customerSearch, showDate, showRate, type Calc, type CustomerFilter } from "@/lib/recip";
import { Logo } from "./Logo";

export const METRICS = ["Total Transferred", "75-Day Confirmed", "Currently Probable", "Pregnancy Rate"] as const;

/** One owner's herd summary: the cards they picked, then their cows. Prints clean on one letter page width. */
export function CustomerReport({ calc, f, show, ranch, today, linkCows = true }: { calc: Calc[]; f: CustomerFilter; show: string[]; ranch: string; today: string; linkCows?: boolean }) {
  const r = customerSearch(calc, f);
  const val: Record<string, string> = {
    "Total Transferred": String(r.totalTransferred),
    "75-Day Confirmed": String(r.confirmed75),
    "Currently Probable": String(r.currentlyProbable),
    "Pregnancy Rate": showRate(r.rate),
  };
  const rows: Row[] = r.rows.map((c) => ({
    key: c.id,
    cells: [linkCows ? cowCell(c.cowId) : { t: c.cowId }, batchCell(c), dateCell(c.transferDate), { t: c.mating }, { t: c.embryoType }, { t: c.grade }, { t: c.company }, { t: c.status, cls: c.status ? `st-${c.status}` : "" }, dateCell(c.status === "Safe" || c.status === "Probable" ? c.dueDate : null)],
  }));
  return (
    <div>
      <div className="print-only mb-4">
        <div className="flex items-end justify-between border-b-2 border-brand-600 pb-2">
          <div>
            <div className="text-lg font-bold text-brand-700">{f.owner} - Herd Summary</div>
            <div className="text-xs text-slate-600">
              {ranch} · {showDate(today)}
              {f.batches.length ? ` · Groups ${f.batches.join(", ")}` : ""}
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
      <Table cols={[{ label: "Cow ID" }, { label: "Batch" }, { label: "Transfer Date" }, { label: "Mating" }, { label: "Embryo Type" }, { label: "Grade" }, { label: "Company" }, { label: "Status" }, { label: "Due Date" }]} rows={rows} empty="No cows match." />
    </div>
  );
}
