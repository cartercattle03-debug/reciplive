import { PregButtons, PregSettings } from "@/components/PregControls";
import { AddPregCow, type KnownCow } from "@/components/AddPregCow";
import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { batchCell, cowCell, dateCell, numCell } from "@/lib/cells";
import { prisma } from "@/lib/prisma";
import { pregCheckList, ranchToday, resultsFor, showDate } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function PregCheck() {
  const m = await staffPage();
  const [{ calc, lists }, org] = await Promise.all([loadRanch(m.organizationId), prisma.organization.findUnique({ where: { id: m.organizationId } })]);
  const list = pregCheckList(calc, { batch: org?.pregBatch, minAge: org?.pregMinAge, maxAge: org?.pregMaxAge });
  const typedAll = calc.filter((c) => c.pregDraft);
  // + Add cow looks her up as her Cow ID is typed (Carter, 2026-10-16): her most recent record, and whether she's
  // already on the sheet waiting on a check.
  const listed = new Set(list.map((c) => c.id));
  const known: Record<string, KnownCow> = {};
  for (const c of calc)
    if (c.latest && c.cowId) {
      const last = c.checks[c.checks.length - 1];
      known[c.cowId] = {
        id: c.id,
        batch: c.batch,
        status: c.status,
        mating: c.mating,
        owner: c.owner,
        embryoType: c.embryoType,
        grade: c.grade,
        company: c.company,
        pregDraft: c.pregDraft ?? null,
        lastCheck: last ? { date: last.checkDate, result: last.result } : null,
        waiting: !c.status || c.status === "Pending" || c.status === "Probable",
        onList: listed.has(c.id),
      };
    }
  const onList = new Set(list.map((c) => c.id));
  // Totals split by check when both are on the list (Carter, 2026-10-14): a cow already Probable is at her 75-day check
  // (Safe / Open); everyone else is at her first check (Probable / Open - or Safe, now and then, at a late first check).
  const second = list.filter((c) => c.status === "Probable");
  const first = list.filter((c) => c.status !== "Probable");
  const tally = (cows: typeof list, title: string, picks: string[]) => {
    const results = cows.map((c) => c.pregDraft).filter(Boolean) as string[];
    const pct = (r: string) => (results.length ? ((results.filter((x) => x === r).length / results.length) * 100).toFixed(1) + "%" : "-");
    return { title, cows: cows.length, checked: results.length, pcts: picks.map((r) => [r, pct(r)] as const) };
  };
  const tallies = [
    ...(first.length || !second.length ? [tally(first, second.length ? "First check" : "", ["Probable", "Safe", "Open"])] : []),
    ...(second.length ? [tally(second, first.length ? "75-day check" : "", ["Safe", "Open"])] : []),
  ];
  const TONE: Record<string, string> = { Probable: "border-amber-300 bg-amber-100 text-amber-900", Safe: "border-emerald-300 bg-emerald-100 text-emerald-900", Open: "border-red-300 bg-red-100 text-red-900" };
  const rows: Row[] = list.map((c) => ({
    key: c.id,
    cells: [
      batchCell(c),
      { ...cowCell(c.cowId), title: `${c.mating}${c.owner ? ` · ${c.owner}` : ""}` },
      numCell(c.embryoAge),
      // A cow already checked Probable can only come back Safe or Open (Carter, 2026-10-14) - no Probable button for her.
      { t: c.pregDraft ?? "", s: c.pregDraft ?? "", cls: "noshade", edit: { api: "preg", id: c.id, field: "result", kind: "buttons", options: resultsFor(c.status, c.pregDraft), value: c.pregDraft ?? "" } },
      // Status follows the Result the moment it's tapped (Carter, 2026-10-16); her record takes it at Confirm & Archive.
      c.pregDraft
        ? { t: c.pregDraft, s: c.pregDraft, cls: `st-${c.pregDraft}`, title: `Was ${c.status || "blank"} - goes on her record at Confirm & Archive` }
        : { t: c.status || "(blank)", cls: c.status ? `st-${c.status}` : "text-slate-400" },
      c.pregDraft ? { ...dateCell(c.pregDraftDate ?? org?.pregDate ?? null), cls: "noshade", edit: { api: "preg", id: c.id, field: "checkDate", kind: "date", value: c.pregDraftDate ?? "" } } : { t: "" },
      { t: c.mating, cls: "noshade", edit: { api: "transfers", id: c.id, field: "mating", kind: "text", value: c.mating } },
      { ...dateCell(c.dueDate), cls: "noshade" + (c.dueOverride ? " font-semibold" : ""), title: c.dueOverride ? "Typed in by hand" : "Transfer date + 276", edit: { api: "transfers", id: c.id, field: "dueOverride", kind: "date", value: c.dueDate ?? "" } },
      { t: c.notes, cls: "noshade notes", edit: { api: "transfers", id: c.id, field: "notes", kind: "text", value: c.notes } },
    ],
  }));
  return (
    <div>
      <PageHeader
        title="Preg Check"
        sub="Every cow still needing a check: her latest record is Pending, Probable or blank. Type results as you go - nothing changes on the records until Confirm & Archive. A result stays with its cow even if you change the Group or ages. Tap Probable, Safe or Open for each cow (tap it again to take it back off) - a cow already Probable gets only Safe or Open. Picking a Result fills in today as its Check Date (tap the date to change it); taking the Result back off clears it. + Add cow looks her up as you type her Cow ID: already on the sheet, you can put her result in right there; otherwise her latest info fills in."
      >
        <AddPregCow lists={{ batches: lists.batches.map((b) => b.label), owners: lists.owners, companies: lists.companies, grades: lists.grades }} cows={known} />
        <PregButtons typed={typedAll.length} offList={typedAll.filter((c) => !onList.has(c.id)).length} />
      </PageHeader>
      <PregSettings s={{ pregDate: org?.pregDate ?? "", pregBatch: org?.pregBatch ?? "", pregMinAge: org?.pregMinAge?.toString() ?? "", pregMaxAge: org?.pregMaxAge?.toString() ?? "" }} batches={lists.batches.map((b) => b.label)} />
      <p className="view-only mb-3 text-sm text-slate-600">
        Showing: {org?.pregBatch ? `Group ${org.pregBatch}` : "any group"}
        {org?.pregMinAge != null || org?.pregMaxAge != null ? `, embryo age ${org?.pregMinAge ?? "any"} to ${org?.pregMaxAge ?? "any"} days` : ""}
      </p>
      <div className="print-only mb-2 text-sm">
        <b>{m.ranch} - Preg Check {showDate(ranchToday())}</b> {org?.pregBatch ? ` · Group ${org.pregBatch}` : ""}
        {org?.pregMinAge != null || org?.pregMaxAge != null ? ` · Age ${org?.pregMinAge ?? ""}-${org?.pregMaxAge ?? ""} days` : ""}
      </div>
      {tallies.map((t) => (
        <div key={t.title || "all"} className="mb-3 flex flex-wrap items-center gap-2 text-sm">
          {t.title && <span className="w-28 text-xs font-bold uppercase tracking-wide text-brand-700">{t.title}</span>}
          {[
            ["Total Cows", String(t.cows), "border-slate-200 bg-white text-slate-700"],
            ["Cows Checked", String(t.checked), "border-slate-200 bg-white text-slate-700"],
            ...t.pcts.map(([r, v]) => [`% ${r}`, v, TONE[r]]),
          ].map(([k, v, tone]) => (
            <span key={k} className={"rounded-md border px-3 py-1.5 font-medium " + tone}>
              {k} <strong className="ml-1 text-base">{v}</strong>
            </span>
          ))}
        </div>
      ))}
      <Table
        cols={[{ label: "Group" }, { label: "Cow ID" }, { label: "Days Bred", title: "Embryo age: days since transfer + 7" }, { label: "Result" }, { label: "Status", title: "Shows the Result as soon as it's tapped (point at it to see what she was); her record takes it at Confirm & Archive" }, { label: "Check Date", title: "Fills in today when a Result is picked; clears if the Result is taken back off" }, { label: "Mating" }, { label: "Due Date", title: "Click to change - Days Bred follows it" }, { label: "Notes" }]}
        rows={rows}
        empty="No cows due with this Group / age range."
      />
      <p className="mt-3 text-xs text-slate-500">Mark her Safe only once she's truly confirmed at her 75-day check - that moves her off this list for good. Open or Safe cows are done and drop off. When first-check and 75-day cows are on the list together, the totals split: First check (cows not yet Probable) and 75-day check (cows already Probable).</p>
    </div>
  );
}
