"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ask, post, toast } from "./ui";

/** Add cows straight onto this year's open list - bought or brought in, or a recip back from calving. */
export function AddOpenCows({ year }: { year: number }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ ids: "", purchaseDate: "", loanLocation: "", cost: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const list = [...new Set(f.ids.split(/[\s,;]+/).map((s) => s.trim()).filter(Boolean))];
  if (!open)
    return (
      <button className="btn edit-only" onClick={() => setOpen(true)}>
        + Add cows
      </button>
    );
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-slate-900/50 p-4" onClick={() => setOpen(false)}>
      <div className="card mt-12 w-full max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-base font-semibold">Add cows to the {year} open list</h2>
        <p className="mb-3 text-sm text-slate-600">Type or paste Cow IDs - one per line, or with spaces or commas between. Paste a whole column from a sheet. Purchase details are optional and go on her Master Sheet line.</p>
        <textarea className="field mb-1 h-36 font-mono" value={f.ids} onChange={(e) => setF({ ...f, ids: e.target.value })} placeholder={"6401\n6402\n6403"} />
        <p className="mb-3 text-xs text-slate-500">{list.length} cow{list.length === 1 ? "" : "s"}</p>
        <div className="grid grid-cols-2 gap-3">
          <label className="text-xs font-medium text-slate-600">
            Purchase Date
            <input className="field mt-0.5" placeholder="Fall 2026" value={f.purchaseDate} onChange={(e) => setF({ ...f, purchaseDate: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Loan Location
            <input className="field mt-0.5" value={f.loanLocation} onChange={(e) => setF({ ...f, loanLocation: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Cost (each)
            <input className="field mt-0.5" inputMode="decimal" value={f.cost} onChange={(e) => setF({ ...f, cost: e.target.value })} />
          </label>
          <label className="text-xs font-medium text-slate-600">
            Note
            <input className="field mt-0.5" placeholder="Bought from ..." value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} />
          </label>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-quiet" onClick={() => setOpen(false)}>
            Cancel
          </button>
          <button
            className="btn-go"
            disabled={busy || !list.length}
            onClick={async () => {
              if (!(await ask(`Add ${list.length} cow${list.length === 1 ? "" : "s"} to the ${year} open list?`, `Add ${list.length}`))) return;
              setBusy(true);
              try {
                await post("/api/open", { action: "add", cowIds: list, year, ...f });
                toast(`${list.length} added to ${year} opens.`);
                setOpen(false);
                setF({ ids: "", purchaseDate: "", loanLocation: "", cost: "", notes: "" });
                router.refresh();
              } catch (e) {
                toast((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Adding..." : `Add ${list.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
