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
      <div className="print-only mb-2 text-sm">
        <b>{m.ranch} - Preg Check {showDate(org?.pregDate)}</b> {org?.pregBatch ? ` · Group ${org.pregBatch}` : ""}
        {org?.pregMinAge != null || org?.pregMaxAge != null ? ` · Age ${org?.pregMinAge ?? ""}-${org?.pregMaxAge ?? ""} days` : ""}
      </div>
      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {[
          ["On the list", String(list.length)],
          ["Results typed", String(results.length)],
          ["% Probable", pct("Probable")],
          ["% Safe", pct("Safe")],
          ["% Open", pct("Open")],
        ].map(([k, v]) => (
          <span key={k} className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-slate-600">
            {k} <strong className="ml-0.5 text-slate-900">{v}</strong>
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
