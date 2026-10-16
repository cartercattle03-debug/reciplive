import { AddTransfer } from "@/components/AddTransfer";
import { FilterForm, Pick } from "@/components/FilterForm";
import { PasteTransfers } from "@/components/PasteTransfers";
import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { batchCell, cowCell, dateCell, numCell } from "@/lib/cells";
import { DELIVERY, EMBRYO_TYPES, STATUSES, inYear, shownStatus } from "@/lib/recip";
import { pickedYear } from "@/lib/server/year";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

type SP = { batch?: string; owner?: string; status?: string; years?: string };

/** The Data tab: one row per cow per transfer (or Pass). Only what's typed shows - the rest is worked out. */
export default async function Transfers({ searchParams }: { searchParams: SP }) {
  const m = await staffPage();
  const { calc: everything, lists } = await loadRanch(m.organizationId);
  const year = pickedYear();
  const allYears = searchParams.years === "all";
  const calc = allYears ? everything : inYear(everything, year);
  const batches = lists.batches.map((b) => b.label);
  const yearBatches = lists.batches.filter((b) => allYears || b.transferDate?.startsWith(String(year))).map((b) => b.label);
  const f = { batch: searchParams.batch ?? "", owner: searchParams.owner ?? "", status: searchParams.status ?? "" };
  const rows = calc
    .filter((c) => !f.batch || c.batch === f.batch)
    .filter((c) => !f.owner || c.owner === f.owner)
    .filter((c) => !f.status || (f.status === "(blank)" ? !c.status : c.status === f.status));
  const ed = (id: string, field: string, value: string, kind: "text" | "select" | "date" = "text", options?: string[]) => ({ api: "transfers" as const, id, field, kind, options, value });
  const table: Row[] = rows.map((c) => ({
    key: c.id,
    cells: [
      { t: "", del: { id: c.id, what: `cow ${c.cowId}'s ${c.batch || ""} record` } },
      { ...batchCell(c), edit: ed(c.id, "batch", c.batch, "select", batches) },
      { ...cowCell(c.cowId), edit: ed(c.id, "cowId", c.cowId) },
      { t: c.mating, edit: ed(c.id, "mating", c.mating) },
      dateCell(c.transferDate),
      { t: c.owner, edit: ed(c.id, "owner", c.owner, "select", lists.owners) },
      { t: c.embryoType, edit: ed(c.id, "embryoType", c.embryoType, "select", [...EMBRYO_TYPES]) },
      { t: c.grade, edit: ed(c.id, "grade", c.grade, "select", lists.grades) },
      { t: c.company, edit: ed(c.id, "company", c.company, "select", lists.companies) },
      { t: shownStatus(c), cls: c.status ? `st-${shownStatus(c).replace(/\s/g, "")}` : "", title: c.status === "Culled" ? "Culled - shows as Open; the cull is in her Master Archive" : undefined, edit: ed(c.id, "status", c.status, "select", [...STATUSES]) },
      { t: c.deliveryStatus, edit: ed(c.id, "deliveryStatus", c.deliveryStatus, "select", [...DELIVERY]) },
      { t: c.notes, cls: "notes", edit: ed(c.id, "notes", c.notes) },
      numCell(c.attemptNo),
      numCell(c.totalAttempts),
      { t: c.repeatFlag, cls: c.repeatFlag === "NEVER SETTLED" ? "text-red-700" : "" },
      { ...dateCell(c.dueDate), edit: ed(c.id, "dueOverride", c.dueDate ?? "", "date") },
      numCell(c.embryoAge),
    ],
  }));
  return (
    <div>
      <PageHeader title="Transfers" sub="One line per cow per transfer - or a Pass (a chute visit with no transfer). Click a cream cell to change it. Copy and paste like a sheet: click a cell and Ctrl+C (Cmd+C on a Mac) to copy it; click a cell, shift-click another in the same column to pick the cells between, then Ctrl+V fills them all - or paste a column copied from a sheet and it fills on down. Attempt #, Total Attempts, Repeat Flag, Due Date and Embryo Age work themselves out.">
        <PasteTransfers />
      </PageHeader>
      <AddTransfer lists={{ batches, owners: lists.owners, companies: lists.companies, grades: lists.grades }} start={yearBatches[yearBatches.length - 1]} dates={Object.fromEntries(lists.batches.map((b) => [b.label, b.transferDate]))} year={year} />
      <FilterForm>
        <Pick name="years" label="Years" value={allYears ? "all" : ""} options={["all"]} all={`${year} only`} />
        <Pick name="batch" label="Group" value={f.batch} options={yearBatches} />
        <Pick name="owner" label="Owner" value={f.owner} options={lists.owners} />
        <Pick name="status" label="Status" value={f.status} options={[...STATUSES, "(blank)"]} />
        <span className="pb-2 text-xs text-slate-500">
          {rows.length} of {calc.length} records{allYears ? " (all years)" : ` in ${year}`}
        </span>
      </FilterForm>
      <Table
        search
        cols={[
          { label: "", noSort: true },
          { label: "Group" },
          { label: "Cow ID" },
          { label: "Mating" },
          { label: "Transfer Date" },
          { label: "Owner" },
          { label: "Embryo Type" },
          { label: "Grade" },
          { label: "Company" },
          { label: "Status" },
          { label: "Delivery" },
          { label: "Notes" },
          { label: "Attempt #", title: "Which try this is for her, in order" },
          { label: "Total Attempts", title: "Every transfer and Pass she has had" },
          { label: "Repeat Flag" },
          { label: "Due Date", title: "Transfer date + 276 days" },
          { label: "Embryo Age", title: "Days since transfer + 7" },
        ]}
        rows={table}
        empty="No transfers yet - add one above, paste a block, or use Import."
      />
    </div>
  );
}
