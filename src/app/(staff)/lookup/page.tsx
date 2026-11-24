import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { batchCell, dateCell, numCell } from "@/lib/cells";
import { cowHistory, pregCheckList, shownStatus } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { seesMoney, staffPage } from "@/lib/server/session";
import { money } from "@/lib/cells";
import { ArchiveTable } from "@/components/ArchiveTable";
import { cowArchive } from "@/lib/cowArchive";
import { recipRatings } from "@/lib/rating";
import { AddPregCow, type KnownCow } from "@/components/AddPregCow";
import { prisma } from "@/lib/prisma";

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
  // Edit any of her records, and her preg check right here (Carter, 2026-11-23: a cow at the chute not on the sheet).
  const canEdit = m.role === "OWNER" && !m.locked;
  const editLists = { batches: R.lists.batches.map((b) => b.label), owners: R.lists.owners, companies: R.lists.companies, grades: R.lists.grades };
  const org = canEdit && last ? await prisma.organization.findUnique({ where: { id: m.organizationId }, select: { pregBatch: true, pregMinAge: true, pregMaxAge: true } }) : null;
  const lastCheck = last?.checks[last.checks.length - 1];
  const known: Record<string, KnownCow> = {};
  if (last && last.latest) {
    const waiting = !last.status || last.status === "Pending" || last.status === "Probable" || last.status === "Not Recorded";
    const onList = waiting && !!org && pregCheckList([last], { batch: org.pregBatch, minAge: org.pregMinAge, maxAge: org.pregMaxAge }).length > 0;
    known[last.cowId] = { id: last.id, batch: last.batch, status: last.status, mating: last.mating, owner: last.owner, embryoType: last.embryoType, grade: last.grade, company: last.company, pregDraft: last.pregDraft ?? null, lastCheck: lastCheck ? { date: lastCheck.checkDate, result: lastCheck.result } : null, embryoAge: last.embryoAge, checkWith: last.checkWith ?? "", waiting, onList };
  }
  const rows: Row[] = h.map((c) => ({
    key: c.id,
    cells: [canEdit ? { t: "", editRow: { id: c.id, batch: c.batch, cowId: c.cowId, mating: c.mating, owner: c.owner, tagColor: c.tagColor ?? "", embryoType: c.embryoType, grade: c.grade, company: c.company, status: c.status, notes: c.notes } } : { t: "" }, numCell(c.attemptNo), batchCell(c), { t: c.mating }, { t: c.owner }, { t: c.embryoType }, { t: c.grade }, { t: c.company }, { t: shownStatus(c), cls: c.status ? `st-${shownStatus(c)}` : "" }, dateCell(c.transferDate), { t: c.deliveryStatus }, { t: c.notes }],
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
                <span className="text-sm font-semibold text-slate-600">Cull check</span>
                {rating.tries ? (
                  // No stars (Carter, 2026-11-23) - cull candidate or not, with her reasons below.
                  rating.cull ? (
                    <span className="rounded-full bg-red-100 px-3 py-0.5 text-sm font-bold text-red-800">Cull candidate</span>
                  ) : (
                    <span className="rounded-full bg-emerald-50 px-3 py-0.5 text-sm font-semibold text-emerald-800">Not a cull candidate</span>
                  )
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
              <p className="mt-2 text-xs text-slate-500">From her own results, weighed by how good each embryo was: about 1 in 6 or worse on the next transfer = cull candidate. Passes don&apos;t count; a lost Probable counts as an Open unless loss was common that day.</p>
            </div>
          )}
          {canEdit && last.latest && (
            <div className="card mb-4 flex flex-wrap items-center gap-3 border-l-4 border-brand-600 p-3 text-sm">
              <span className="font-semibold text-slate-700">Preg check</span>
              <span className="text-slate-600">
                {last.pregDraft ? `Result typed: ${last.pregDraft} - confirmed with the rest at Confirm & Archive.` : known[last.cowId]?.onList ? "She's on today's Preg Check sheet." : known[last.cowId]?.waiting ? `Waiting on her check in group ${last.batch || "(none)"} - not on the sheet showing now.` : `Not waiting on a check (${shownStatus(last) || "blank"}).`}
              </span>
              <AddPregCow lists={editLists} cows={known} group={org?.pregBatch ?? ""} startId={last.cowId} label={known[last.cowId]?.waiting ? "Put in her result / check her with this group" : "Add her to the preg check sheet"} />
            </div>
          )}
          <h2 className="mb-1.5 text-sm font-semibold text-brand-700">Transfers</h2>
          <Table lists={editLists} cols={[{ label: "", noSort: true }, { label: "Attempt #" }, { label: "Batch" }, { label: "Mating" }, { label: "Owner" }, { label: "Embryo Type" }, { label: "Grade" }, { label: "Company" }, { label: "Status" }, { label: "Transfer Date" }, { label: "Delivery Status" }, { label: "Notes" }]} rows={rows} maxHeight={false} />
          <h2 className="mb-1.5 mt-6 text-sm font-semibold text-brand-700">Her full archive, in order</h2>
          <ArchiveTable steps={cowArchive(calc, archive, cows, events, last.cowId)} showCow={false} showMoney={owner} />
        </>
      )}
    </div>
  );
}
