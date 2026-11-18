"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { PaperButton } from "./PaperButton";
import { post, toast } from "./ui";
import type { KnownCow } from "./AddPregCow";
import { findCowId } from "@/lib/findCow";
import { readResult, type PaperPage } from "@/lib/paper";
import { resultsFor } from "@/lib/recip";

type Line = { cowId: string; written: string; id?: string; result?: string; why: string; unsure: boolean };

/**
 * Preg Check: read a paper preg sheet (Carter, 2026-11-18). Each line read is matched to her by Cow ID (054 for 54 only
 * when one cow fits); the results go on the sheet as typed results - nothing touches her record until Confirm & Archive,
 * the same as tapping the buttons. Lines that don't fit (no such cow, not waiting on a check, a result that can't be
 * read or isn't allowed for her) are listed and left alone.
 */
export function PregPaper({ cows }: { cows: Record<string, KnownCow> }) {
  const router = useRouter();
  const [lines, setLines] = useState<Line[] | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const ids = Object.keys(cows);
  const onRead = (pages: PaperPage[]) => {
    const out: Line[] = [];
    for (const p of pages)
      for (const r of p.rows) {
        if (r.struck || !r.cowId) continue;
        const hit = findCowId(ids, r.cowId).id;
        const cow = hit ? cows[hit] : undefined;
        const unsure = r.unsure.includes("cowId") || r.unsure.includes("result");
        let res = readResult(r.result);
        // "P" / "+" on a cow already Probable is her 75-day check: pregnant = Safe.
        if (res === "Probable" && cow?.status === "Probable" && cow.pregDraft !== "Probable") res = "Safe";
        let why = r.why;
        if (!cow) why = "No cow with this ID";
        else if (!cow.waiting) why = `Not waiting on a check (her latest record is ${cow.status || "blank"})`;
        else if (!r.result) why = "No result written";
        else if (!res) why = `Can't tell what "${r.result}" means - tap it on the sheet`;
        else if (!resultsFor(cow.status, cow.pregDraft).includes(res)) why = `${res} isn't a choice for her now (she's ${cow.status})`;
        out.push({ cowId: hit ?? r.cowId, written: r.result, id: cow && cow.waiting && res && resultsFor(cow.status, cow.pregDraft).includes(res) ? cow.id : undefined, result: res || undefined, why, unsure });
      }
    setNote(pages.map((p) => [p.header.checkDate && `Check date on the sheet: ${p.header.checkDate}.`, p.remarks].filter(Boolean).join(" ")).filter(Boolean).join(" "));
    setLines(out);
  };
  const good = (lines ?? []).filter((l) => l.id);
  return (
    <>
      <PaperButton kind="preg" onRead={onRead} />
      {lines && (
        <div className="fixed inset-0 z-40 flex items-start justify-center overflow-y-auto bg-slate-900/30 px-4 py-10" onClick={() => !busy && setLines(null)}>
          <div className="card w-full max-w-2xl space-y-3 p-5 text-sm" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-base font-semibold text-slate-900">Read off the paper - {lines.length} line{lines.length === 1 ? "" : "s"}</h2>
            <p className="text-xs text-slate-500">
              Check these against the sheet. The good ones go on the Preg Check as typed results - her record changes only at Confirm & Archive, and any one can be changed there first. Amber = the reader wasn&apos;t sure.
              {note && ` ${note}`}
            </p>
            <div className="max-h-[55vh] overflow-auto rounded border border-slate-200">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-brand-600 text-xs text-white">
                  <tr>
                    <th className="px-2 py-1 text-left">Cow ID</th>
                    <th className="px-2 py-1">Written</th>
                    <th className="px-2 py-1">Goes on as</th>
                    <th className="px-2 py-1 text-left">Note</th>
                  </tr>
                </thead>
                <tbody>
                  {lines.map((l, i) => (
                    <tr key={i} className={"border-t border-slate-100 " + (l.unsure ? "bg-amber-50" : "")}>
                      <td className="px-2 py-1 font-semibold">{l.cowId}</td>
                      <td className="px-2 py-1 text-center">{l.written || "-"}</td>
                      <td className="px-2 py-1 text-center">{l.id ? <span className={`rounded px-2 py-0.5 st-${l.result}`}>{l.result}</span> : <span className="text-slate-400">left off</span>}</td>
                      <td className="px-2 py-1 text-xs text-slate-600">{l.why}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn-quiet" disabled={busy} onClick={() => setLines(null)}>
                Cancel
              </button>
              <button
                type="button"
                className="btn-go ml-auto"
                disabled={busy || !good.length}
                onClick={async () => {
                  setBusy(true);
                  let n = 0;
                  for (const l of good) {
                    try {
                      await post("/api/preg", { action: "draft", id: l.id, result: l.result });
                      n++;
                    } catch (x) {
                      toast(`${l.cowId}: ${(x as Error).message}`, true);
                    }
                  }
                  setBusy(false);
                  setLines(null);
                  toast(`${n} result${n === 1 ? "" : "s"} put on the Preg Check - check them, then Confirm & Archive.`);
                  router.refresh();
                }}
              >
                {busy ? "Putting them on..." : `Put ${good.length} result${good.length === 1 ? "" : "s"} on the sheet`}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
