"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ask, post, toast } from "./ui";

type S = { pregDate: string; pregBatch: string; pregMinAge: string; pregMaxAge: string };

/** Date / Group / Min-Max Age: saved for the ranch, so the office and the chute see the same list. */
export function PregSettings({ s, batches }: { s: S; batches: string[] }) {
  const router = useRouter();
  const [f, setF] = useState(s);
  const save = async (k: keyof S, v: string) => {
    const next = { ...f, [k]: v };
    setF(next);
    try {
      await post("/api/preg", { action: "settings", [k]: v });
      router.refresh();
    } catch (e) {
      toast((e as Error).message, true);
    }
  };
  return (
    <div className="card no-print edit-only mb-3 flex flex-wrap items-end gap-3 p-3">
      <label className="text-xs font-medium text-slate-600">
        Date
        <input type="date" className="field mt-0.5 w-40" value={f.pregDate} onChange={(e) => save("pregDate", e.target.value)} />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Group
        <select className="field mt-0.5 w-28" value={f.pregBatch} onChange={(e) => save("pregBatch", e.target.value)}>
          <option value="">Any group</option>
          {batches.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Min Age
        <input className="field mt-0.5 w-20" inputMode="numeric" defaultValue={f.pregMinAge} onBlur={(e) => e.target.value !== f.pregMinAge && save("pregMinAge", e.target.value)} />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Max Age
        <input className="field mt-0.5 w-20" inputMode="numeric" defaultValue={f.pregMaxAge} onBlur={(e) => e.target.value !== f.pregMaxAge && save("pregMaxAge", e.target.value)} />
      </label>
      <p className="max-w-md text-xs text-slate-500">Pick a Group to pull one transfer group, or leave it on Any group and use Min / Max embryo age (days, counting the 7-day embryo) to pull every cow due - e.g. 42 to 47.</p>
    </div>
  );
}

export function PregButtons({ typed, offList, hasDate }: { typed: number; offList: number; hasDate: boolean }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <span className="edit-only flex flex-wrap items-center gap-2">
      <button className="btn-quiet" onClick={() => window.print()}>
        Print chute sheet
      </button>
      <button
        className="btn-quiet"
        disabled={!typed || busy}
        onClick={async () => {
          if (!(await ask(`Clear all ${typed} typed result${typed === 1 ? "" : "s"}? Nothing on the records changes.`, "Clear them"))) return;
          await post("/api/preg", { action: "clear" }).catch((e) => toast(e.message, true));
          router.refresh();
        }}
      >
        Clear typed results
      </button>
      <button
        className={typed && hasDate ? "btn-go" : "btn"}
        disabled={!typed || busy}
        onClick={async () => {
          if (!hasDate) return toast("Enter the preg check Date first.", true);
          const extra = offList ? `\n\n${offList} of them belong to cows not on the list showing now (typed under another Group or age range) - they are confirmed too.` : "";
          if (!(await ask(`Confirm ${typed} result${typed === 1 ? "" : "s"}? Each goes onto her record and into the Preg Check Archive.${extra}\n\nAccount > Undo can take it back.`, "Confirm & Archive"))) return;
          setBusy(true);
          try {
            const r = await post("/api/preg", { action: "confirm" });
            toast(`Confirmed and archived ${r.confirmed} result${r.confirmed === 1 ? "" : "s"}.`);
            router.refresh();
          } catch (e) {
            toast((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? "Saving..." : `Confirm & Archive${typed ? ` (${typed})` : ""}`}
      </button>
    </span>
  );
}
