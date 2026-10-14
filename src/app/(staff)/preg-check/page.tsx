import { PregButtons, PregSettings } from "@/components/PregControls";
import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { batchCell, cowCell, dateCell, numCell } from "@/lib/cells";
import { prisma } from "@/lib/prisma";
import { PREG_RESULTS, pregCheckList, showDate } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function PregCheck() {
  const m = await staffPage();
  const [{ calc, lists }, org] = await Promise.all([loadRanch(m.organizationId), prisma.organization.findUnique({ where: { id: m.organizationId } })]);
  const list = pregCheckList(calc, { batch: org?.pregBatch, minAge: org?.pregMinAge, maxAge: org?.pregMaxAge });
  const typedAll = calc.filter((c) => c.pregDraft);
  const onList = new Set(list.map((c) => c.id));
  const results = list.map((c) => c.pregDraft).filter(Boolean) as string[];
  const pct = (r: string) => (results.length ? ((results.filter((x) => x === r).length / results.length) * 100).toFixed(1) + "%" : "-");
  const rows: Row[] = list.map((c) => ({
    key: c.id,
    cells: [
      batchCell(c),
      cowCell(c.cowId),
      { t: c.mating },
      { t: c.owner },
      numCell(c.embryoAge),
      { t: c.status || "(blank)", cls: c.status ? `st-${c.status}` : "text-slate-400" },
      dateCell(c.dueDate),
      { t: c.pregDraft ?? "", cls: c.pregDraft ? `st-${c.pregDraft}` : "", edit: { api: "preg", id: c.id, field: "result", kind: "select", options: [...PREG_RESULTS], value: c.pregDraft ?? "" } },
    ],
  }));
  return (
    <div>
      <PageHeader
        title="Preg Check"
        sub="Every cow still needing a check: her latest record is Pending, Probable or blank. Type results as you go - nothing changes on the records until Confirm & Archive. A result stays with its cow even if you change the Group or ages."
      >
        <PregButtons typed={typedAll.length} offList={typedAll.filter((c) => !onList.has(c.id)).length} hasDate={!!org?.pregDate} />
      </PageHeader>
      <PregSettings s={{ pregDate: org?.pregDate ?? "", pregBatch: org?.pregBatch ?? "", pregMinAge: org?.pregMinAge?.toString() ?? "", pregMaxAge: org?.pregMaxAge?.toString() ?? "" }} batches={lists.batches.map((b) => b.label)} />
      <p className="view-only mb-3 text-sm text-slate-600">
        Showing: {org?.pregBatch ? `Group ${org.pregBatch}` : "any group"}
        {org?.pregMinAge != null || org?.pregMaxAge != null ? `, embryo age ${org?.pregMinAge ?? "any"} to ${org?.pregMaxAge ?? "any"} days` : ""}
        {org?.pregDate ? ` · check date ${showDate(org.pregDate)}` : ""}
      </p>
      <div className="print-only mb-2 text-sm">
        <b>{m.ranch} - Preg Check {showDate(org?.pregDate)}</b> {org?.pregBatch ? ` · Group ${org.pregBatch}` : ""}
        {org?.pregMinAge != null || org?.pregMaxAge != null ? ` · Age ${org?.pregMinAge ?? ""}-${org?.pregMaxAge ?? ""} days` : ""}
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-sm">
        {[
          ["Total Cows", String(list.length), "border-slate-200 bg-white text-slate-700"],
          ["Cows Checked", String(results.length), "border-slate-200 bg-white text-slate-700"],
          ["% Probable", pct("Probable"), "border-amber-300 bg-amber-100 text-amber-900"],
          ["% Safe", pct("Safe"), "border-emerald-300 bg-emerald-100 text-emerald-900"],
          ["% Open", pct("Open"), "border-red-300 bg-red-100 text-red-900"],
        ].map(([k, v, tone]) => (
          <span key={k} className={"rounded-md border px-3 py-1.5 font-medium " + tone}>
            {k} <strong className="ml-1 text-base">{v}</strong>
          </span>
        ))}
      </div>
      <Table
        cols={[{ label: "Group" }, { label: "Cow ID" }, { label: "Mating" }, { label: "Owner" }, { label: "Embryo Age (Days)" }, { label: "Now" }, { label: "Due Date" }, { label: "PREG CHECK RESULT" }]}
        rows={rows}
        empty="No cows due with this Group / age range."
      />
      <p className="mt-3 text-xs text-slate-500">Mark her Safe only once she's truly confirmed at her second check - that moves her off this list for good. Open or Safe cows are done and drop off.</p>
    </div>
  );
}
