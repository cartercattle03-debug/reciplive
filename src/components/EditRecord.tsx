"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, toast } from "./ui";
import { EMBRYO_TYPES, STATUSES } from "@/lib/recip";

export type EditLists = { batches: string[]; owners: string[]; companies: string[]; grades: string[] };
export type RecordValues = { id: string; batch: string; cowId: string; mating: string; owner: string; embryoType: string; grade: string; company: string; status: string; notes: string };

const FIELDS: { k: keyof RecordValues; label: string; pick?: "batches" | "type" | "status"; list?: "owners" | "companies" | "grades" }[] = [
  { k: "batch", label: "Group", pick: "batches" },
  { k: "cowId", label: "Cow ID" },
  { k: "mating", label: "Mating" },
  { k: "owner", label: "Owner", list: "owners" },
  { k: "embryoType", label: "Embryo Type", pick: "type" },
  { k: "grade", label: "Grade", list: "grades" },
  { k: "company", label: "Company", list: "companies" },
  { k: "status", label: "Status", pick: "status" },
  { k: "notes", label: "Notes" },
];

/** Edit button + pop-up: change any part of her latest record, saved all at once. */
export function EditRecord({ v, lists }: { v: RecordValues; lists: EditLists }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(v);
  const [busy, setBusy] = useState(false);
  const opts = (p: "batches" | "type" | "status") => (p === "batches" ? lists.batches : p === "type" ? [...EMBRYO_TYPES] : [...STATUSES]);
  if (!open)
    return (
      <button type="button" className="edit-only rounded-full border border-brand-600 px-2.5 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50" onClick={() => (setF(v), setOpen(true))}>
        Edit
      </button>
    );
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-slate-900/50 p-4 text-left" onClick={() => setOpen(false)}>
      <form
        className="card mt-16 w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          const patch: Record<string, string> = {};
          for (const { k } of FIELDS) if (f[k] !== v[k]) patch[k] = f[k];
          if (!Object.keys(patch).length) return setOpen(false);
          setBusy(true);
          try {
            await post("/api/transfers", { action: "edit", id: v.id, patch });
            toast(`Cow ${f.cowId} saved.`);
            setOpen(false);
            router.refresh();
          } catch (x) {
            toast((x as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <h2 className="mb-1 text-base font-semibold">Cow {v.cowId} - her latest record</h2>
        <p className="mb-3 text-xs text-slate-500">Changing Status here (to Pending after a new transfer is planned, or Culled) moves her off Open Inventory.</p>
        <div className="grid grid-cols-2 gap-3">
          {FIELDS.map((d) => (
            <label key={d.k} className={"text-xs font-medium text-slate-600 " + (d.k === "notes" || d.k === "mating" ? "col-span-2" : "")}>
              {d.label}
              {d.pick ? (
                <select className="field mt-0.5" value={f[d.k]} onChange={(e) => setF({ ...f, [d.k]: e.target.value })}>
                  {d.pick !== "status" && <option value=""></option>}
                  {opts(d.pick).map((o) => (
                    <option key={o}>{o}</option>
                  ))}
                </select>
              ) : (
                <>
                  <input className="field mt-0.5" value={f[d.k]} list={d.list ? `er-${d.list}` : undefined} onChange={(e) => setF({ ...f, [d.k]: e.target.value })} />
                  {d.list && (
                    <datalist id={`er-${d.list}`}>
                      {lists[d.list].map((o) => (
                        <option key={o} value={o} />
                      ))}
                    </datalist>
                  )}
                </>
              )}
            </label>
          ))}
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button className="btn" disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
