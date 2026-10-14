import { FilterForm, Pick } from "@/components/FilterForm";
import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { batchCell, cowCell, dateCell, numCell } from "@/lib/cells";
import { historyNote } from "@/lib/history";
import { OPEN_SORTS, cullFlag, openInventory, type OpenSort } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function OpenInventory({ searchParams }: { searchParams: { sort?: string } }) {
  const m = await staffPage();
  const { calc, lists } = await loadRanch(m.organizationId);
  const editLists = { batches: lists.batches.map((b) => b.label), owners: lists.owners, companies: lists.companies, grades: lists.grades };
  const sort = (OPEN_SORTS as readonly string[]).includes(searchParams.sort ?? "") ? (searchParams.sort as OpenSort) : "Date Checked Open";
  const list = openInventory(calc, sort);
  const rows: Row[] = list.map((c) => ({
    key: c.id,
    cls: cullFlag(c) ? "flag" : "",
    cells: [
      { t: "", pick: c.id },
      { ...cowCell(c.cowId), title: historyNote(calc, c.cowId) },
      { t: c.repeatFlag, cls: c.repeatFlag === "NEVER SETTLED" ? "text-red-700 font-semibold" : "" },
      numCell(c.totalAttempts),
      numCell(c.freshReceived),
      numCell(c.frozenReceived),
      numCell(c.timesProbable),
      numCell(c.timesPassed),
      { t: c.status, cls: `st-${c.status}` },
      batchCell(c),
      dateCell(c.dateCheckedOpen),
      { t: c.notes, edit: { api: "transfers", id: c.id, field: "notes", kind: "text", value: c.notes } },
      { t: "", editRow: { id: c.id, batch: c.batch, cowId: c.cowId, mating: c.mating, owner: c.owner, embryoType: c.embryoType, grade: c.grade, company: c.company, status: c.status, notes: c.notes } },
    ],
  }));
  return (
    <div>
      <PageHeader
        title="Open Inventory"
        sub="Every cow whose latest record is Open or Pass - ready for her next attempt. She drops off the moment a new transfer is added for her. Point at (or tap) a Cow ID for her history; click it for the full Cow Lookup. Yellow = passed over twice or more, a cull candidate. Tick Cull and press Cull checked to cull; Edit changes her record."
      />
      <FilterForm>
        <Pick name="sort" label="Sort By" value={sort} options={[...OPEN_SORTS]} all={null} />
        <span className="pb-2 text-xs text-slate-500">{list.length} cows listed</span>
      </FilterForm>
      <Table
        search
        cull
        lists={editLists}
        cols={[{ label: "Cull", noSort: true, title: "Tick the cows to cull, then press Cull checked" }, { label: "Cow ID" }, { label: "Repeat Flag" }, { label: "Total Attempts" }, { label: "Fresh Received" }, { label: "Frozen Received" }, { label: "Times Probable" }, { label: "Times Passed" }, { label: "Status" }, { label: "Last Group" }, { label: "Date Checked Open" }, { label: "Notes" }, { label: "", noSort: true }]}
        rows={rows}
        empty="No open cows."
      />
      <p className="mt-3 text-xs text-slate-500">Repeat vs Never Settled: Never Settled = 2+ Opens and no Safe anywhere in her record.</p>
    </div>
  );
}
