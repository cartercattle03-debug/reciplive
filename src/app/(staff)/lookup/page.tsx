import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { batchCell, dateCell, numCell } from "@/lib/cells";
import { cowHistory, shownStatus } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { seesMoney, staffPage } from "@/lib/server/session";
import { money } from "@/lib/cells";
import { ArchiveTable } from "@/components/ArchiveTable";
import { cowArchive } from "@/lib/cowArchive";
import { recipRatings, starText } from "@/lib/rating";

export default async function CowLookup({ searchParams }: { searchParams: { cow?: string } }) {
  const m = await staffPage();
  const R = await loadRanch(m.organizationId);
  const { calc, archive, events } = R;
  // A Manager login sees nothing about money (Carter, 2026-10-14): her purchase, cost, loan, sale and transaction # stay off the
  // page - so her archive below has no Purchased or Sold lines and no Price column.
  const owner = seesMoney(m);
  const cows = owner ? R.cows : new Map<string, never>();
  const id = (searchParams.cow ?? "").trim();
  const h = id ? cowHistory(calc, id) : [];
  const last = h[h.length - 1];
  const rating = last ? recipRatings(calc).get(last.cowId) : undefined;
  const extra = id ? cows.get(h[0]?.cowId ?? id) : undefined;
  const rows: Row[] = h.map((c) => ({
    key: c.id,
    cells: [numCell(c.attemptNo), batchCell(c), { t: c.mating }, { t: c.owner }, { t: c.embryoType }, { t: c.grade }, { t: c.company }, { t: shownStatus(c), cls: c.status ? `st-${shownStatus(c)}` : "" }, dateCell(c.transferDate), { t: c.deliveryStatus }, { t: c.notes }],
  }));
  return (
    <div>
      <PageHeader title="Cow Lookup" sub="Type a Cow ID to see her complete transfer history, in order." />
      <form method="get" className="no-print mb-4 flex items-end gap-2">
        <label className="text-xs font-medium text-slate-600">
          Cow ID
          <input name="cow" defaultValue={id} className="field mt-0.5 w-40" autoFocus />
        </label>
        <button className="btn">Look up</button>
      </form>
      {id && !h.length && <p className="text-sm text-slate-600">No records for Cow ID {id}.</p>}
      {last && (
        <>
          <div className="mb-4 overflow-hidden rounded-lg">
            <div className="bg-brand-600 px-5 py-4 text-white">
              <div className="text-2xl font-bold">Cow {last.cowId}</div>
              <div className="mt-1 text-sm opacity-90">
                Lifetime Attempts: {h.length} &nbsp;|&nbsp; Repeat Flag: {last.repeatFlag} &nbsp;|&nbsp; Times Probable: {last.timesProbable} &nbsp;|&nbsp; Times Passed: {last.timesPassed} &nbsp;|&nbsp; Now: {shownStatus(last) || "(blank)"}
              </div>
              {extra && (extra.purchaseDate || extra.loanLocation || extra.cost !== null || extra.salePrice !== null) && (
                <div className="mt-1 text-xs opacity-80">
                  {[extra.purchaseDate && `Purchased ${extra.purchaseDate}`, extra.loanLocation, extra.cost !== null && `Cost ${money(extra.cost)}`, extra.salePrice !== null && `Sold ${money(extra.salePrice)}`].filter(Boolean).join(" · ")}
                </div>
              )}
            </div>
          </div>
          {rating && (
            <div className={"card mb-4 border-l-4 p-3 " + (rating.cull ? "border-red-600" : "border-rust")}>
              <div className="flex flex-wrap items-baseline gap-3">
                <span className="text-sm font-semibold text-slate-600">Recip Rating</span>
                {rating.tries ? (
                  <>
                    <span className={"text-xl font-bold " + (rating.cull ? "text-red-700" : "text-amber-600")}>
                      {starText(rating.stars)} {rating.stars}
                    </span>
                    {rating.cull && <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-bold text-red-800">Cull candidate</span>}
                  </>
                ) : (
                  <span className="text-sm text-slate-500">New - no finished transfers yet, rates as a fresh recip</span>
                )}
              </div>
              {rating.steps.length > 0 && (
                <ol className="mt-2 list-inside list-decimal text-sm text-slate-700">
                  {rating.steps.map((s, i) => (
                    <li key={i} className={s.effect === "up" ? "text-emerald-700" : s.effect === "down" ? "text-red-700" : s.effect === "light" ? "text-amber-700" : "text-slate-500"}>
                      {s.batch}: {s.text}
                    </li>
                  ))}
                </ol>
              )}
              <p className="mt-2 text-xs text-slate-500">Her odds on the next transfer, from her own results weighed by how good each embryo was. 5 = as good as a fresh recip; 2½ and under (about 1 in 6 or worse) = cull candidate. Passes don&apos;t count; a lost Probable counts as an Open unless loss was common that day.</p>
            </div>
          )}
          <h2 className="mb-1.5 text-sm font-semibold text-brand-700">Transfers</h2>
          <Table cols={[{ label: "Attempt #" }, { label: "Batch" }, { label: "Mating" }, { label: "Owner" }, { label: "Embryo Type" }, { label: "Grade" }, { label: "Company" }, { label: "Status" }, { label: "Transfer Date" }, { label: "Delivery Status" }, { label: "Notes" }]} rows={rows} maxHeight={false} />
          <h2 className="mb-1.5 mt-6 text-sm font-semibold text-brand-700">Her full archive, in order</h2>
          <ArchiveTable steps={cowArchive(calc, archive, cows, events, last.cowId)} showCow={false} showMoney={owner} />
        </>
      )}
    </div>
  );
}
