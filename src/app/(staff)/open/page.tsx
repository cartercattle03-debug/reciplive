import { AddOpenCows } from "@/components/AddOpenCows";
import { FilterForm, Pick } from "@/components/FilterForm";
import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { cowCell, dateCell, numCell } from "@/lib/cells";
import { historyNote } from "@/lib/history";
import { CULL_AT, recipRatings, starText } from "@/lib/rating";
import { OPEN_SORTS, openCull, openList } from "@/lib/openList";
import type { OpenSort } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";
import { pickedYear, thisYear } from "@/lib/server/year";

export default async function OpenInventory({ searchParams }: { searchParams: { sort?: string } }) {
  const m = await staffPage();
  const { calc, lists, cows } = await loadRanch(m.organizationId);
  const year = pickedYear();
  const editLists = { batches: lists.batches.map((b) => b.label), owners: lists.owners, companies: lists.companies, grades: lists.grades };
  const sort = (OPEN_SORTS as readonly string[]).includes(searchParams.sort ?? "") ? (searchParams.sort as OpenSort) : "Date Checked Open";
  const list = openList(calc, cows, year, thisYear(), sort);
  // Recip Rating from her whole history, every year (Carter, 2026-10-15).
  const ratings = recipRatings(calc);
  const rows: Row[] = list.map((e) => {
    const c = e.rec;
    return {
      key: e.cowId,
      cls: openCull(e) ? "flag" : "",
      cells: [
        { t: "", del: { id: e.cowId, what: `cow ${e.cowId}`, off: true } },
        { t: "", pick: e.cowId },
        { ...cowCell(e.cowId), title: historyNote(calc, e.cowId) },
        (() => {
          const r = ratings.get(e.cowId);
          if (!r || !r.tries) return { t: "New", s: 99, cls: "text-xs text-slate-500", title: "No finished transfers yet - rates as a fresh recip" };
          return {
            t: `${starText(r.stars)} ${r.stars}`,
            s: r.score,
            cls: "whitespace-nowrap " + (r.cull ? "font-semibold text-red-700" : "font-semibold text-amber-600"),
            title: (r.cull ? "Cull candidate\n" : "") + r.steps.map((x) => `${x.batch}: ${x.text}`).join("\n"),
          };
        })(),
        { t: e.added ? (c ? `Added back (after ${c.status})` : "New - no transfer yet") : e.repeatFlag, cls: e.repeatFlag === "NEVER SETTLED" ? "text-red-700 font-semibold" : e.added ? "text-brand-700" : "" },
        numCell(e.totalAttempts),
        numCell(c?.freshReceived ?? 0),
        numCell(c?.frozenReceived ?? 0),
        numCell(c?.timesProbable ?? 0),
        numCell(e.timesPassed),
        { t: c?.status ?? "", cls: c ? `st-${c.status}` : "" },
        { t: c?.batch ?? "", s: c?.batchOrder ?? 0, cls: "grp" },
        dateCell(e.dateCheckedOpen),
        c ? { t: c.notes, cls: "notes", edit: { api: "transfers", id: c.id, field: "notes", kind: "text", value: c.notes } } : { t: "" },
        c ? { t: "", editRow: { id: c.id, batch: c.batch, cowId: c.cowId, mating: c.mating, owner: c.owner, embryoType: c.embryoType, grade: c.grade, company: c.company, status: c.status, notes: c.notes } } : { t: "" },
      ],
    };
  });
  return (
    <div>
      <PageHeader
        title={`Open Inventory - ${year}`}
        sub={`Every cow open in ${year}, ready for her next attempt: checked Open in ${year} (a Nov / Dec transfer checked Open in January lands in the new year), a Pass, or added here. She drops off when a new transfer goes in for her. Tick cows to cull them or move them to ${year + 1}'s opens; the red ✕ takes a gone cow off the list. Yellow = passed over twice or more. Rating = her odds on the next transfer, 5 = as good as a fresh recip; red (${CULL_AT} and under, about 1 in 6 or worse) = cull candidate - point at it for the reasons.`}
      >
        {m.role === "OWNER" && <AddOpenCows year={year} />}
      </PageHeader>
      <FilterForm>
        <Pick name="sort" label="Sort By" value={sort} options={[...OPEN_SORTS]} all={null} />
        <span className="pb-2 text-xs text-slate-500">{list.length} cows listed</span>
      </FilterForm>
      <Table
        search
        lists={editLists}
        picks={[
          { label: `Move to ${year + 1} opens`, url: "/api/open", action: "move", extra: { year: year + 1 }, ask: `Move {n} cow(s) to the ${year + 1} open list?\n\n{names}\n\nThey leave the ${year} list. Account > Undo can take it back.` },
          { label: "Cull checked", url: "/api/open", action: "cull", danger: true, ask: "Cull {n} cow(s)?\n\n{names}\n\nEach one is marked Culled with today's date in her Master Archive and leaves the open list. Account > Undo can take it back." },
        ]}
        cols={[
          { label: "", noSort: true },
          { label: "Tick", noSort: true, title: "Tick cows, then Cull checked or Move to next year" },
          { label: "Cow ID" },
          { label: "Rating", title: "Recip Rating 1-5: her odds on the next transfer from her own results, weighed by how good each embryo was. Red = cull candidate. Point at it for the reasons." },
          { label: "Repeat Flag" },
          { label: "Total Attempts" },
          { label: "Fresh Received" },
          { label: "Frozen Received" },
          { label: "Times Probable" },
          { label: "Times Passed" },
          { label: "Status" },
          { label: "Last Group" },
          { label: "Date Checked Open" },
          { label: "Notes" },
          { label: "", noSort: true },
        ]}
        rows={rows}
        empty={`No open cows in ${year}.`}
      />
      <p className="mt-3 text-xs text-slate-500">Never Settled = 2+ Opens and no Safe anywhere in her record.</p>
    </div>
  );
}
