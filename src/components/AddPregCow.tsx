"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, toast } from "./ui";
import { EMBRYO_TYPES } from "@/lib/recip";

type Lists = { batches: string[]; owners: string[]; companies: string[]; grades: string[] };

/** "+ Add cow" on Preg Check: a cow missing from the sheet goes in as a Pending transfer and joins the list and the totals. */
export function AddPregCow({ lists, batch }: { lists: Lists; batch: string }) {
  const router = useRouter();
  const blank = { batch: batch || lists.batches[lists.batches.length - 1] || "", cowId: "", mating: "", owner: "", embryoType: "", grade: "", company: "", dueOverride: "", notes: "" };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  if (!open)
    return (
      <button className="btn edit-only" onClick={() => (setF(blank), setOpen(true))}>
        + Add cow
      </button>
    );
  const box = (k: keyof typeof f, label: string, list?: string[], type = "text", wide = false) => (
    <label className={"text-xs font-medium text-slate-600 " + (wide ? "col-span-2" : "")}>
      {label}
      <input className="field mt-0.5" type={type} value={f[k]} onChange={set(k)} list={list ? `apc-${k}` : undefined} />
      {list && (
        <datalist id={`apc-${k}`}>
          {list.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </label>
  );
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-slate-900/50 p-4" onClick={() => setOpen(false)}>
      <form
        className="card mt-12 w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await post("/api/transfers", { action: "addPreg", row: f });
            toast(`Cow ${f.cowId} added to the sheet.`);
            setF({ ...blank, batch: f.batch, mating: f.mating, owner: f.owner, embryoType: f.embryoType, company: f.company });
            router.refresh();
          } catch (x) {
            toast((x as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="mb-1 text-base font-semibold">Add a cow to the preg check sheet</h2>
        <p className="mb-3 text-xs text-slate-500">
          For a cow that should be here but isn&apos;t - missed when the batch went in, or her info was missing. She goes in as a Pending transfer in this group, shows on the sheet, and counts in the totals and percentages. Leave Due Date blank to use the group&apos;s transfer date + 276; type one if hers is different - Days Bred follows it.
        </p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-slate-600">
            Group
            <select className="field mt-0.5" value={f.batch} onChange={set("batch")} required>
              {lists.batches.map((b) => (
                <option key={b}>{b}</option>
              ))}
            </select>
          </label>
          {box("cowId", "Cow ID")}
          {box("mating", "Mating", undefined, "text", true)}
          {box("dueOverride", "Due Date (if different)", undefined, "date")}
          {box("owner", "Owner", lists.owners)}
          <label className="text-xs font-medium text-slate-600">
            Embryo Type
            <select className="field mt-0.5" value={f.embryoType} onChange={set("embryoType")}>
              <option value=""></option>
              {EMBRYO_TYPES.map((t) => (
                <option key={t}>{t}</option>
              ))}
            </select>
          </label>
          {box("grade", "Grade", lists.grades)}
          {box("company", "Company", lists.companies)}
          {box("notes", "Notes", undefined, "text", true)}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
            Done
          </button>
          <button className="btn-go" disabled={busy || !f.cowId.trim() || !f.batch}>
            {busy ? "Adding..." : "Add to sheet"}
          </button>
        </div>
      </form>
    </div>
  );
}
