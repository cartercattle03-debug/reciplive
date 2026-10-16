"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { post, toast } from "./ui";
import { EMBRYO_TYPES, resultsFor, showDate } from "@/lib/recip";
import { findCowId } from "@/lib/findCow";

type Lists = { batches: string[]; owners: string[]; companies: string[]; grades: string[] };
/** A cow's most recent record, for the lookup as her Cow ID is typed. */
export type KnownCow = {
  id: string;
  batch: string;
  status: string;
  mating: string;
  owner: string;
  embryoType: string;
  grade: string;
  company: string;
  pregDraft: string | null;
  lastCheck: { date: string; result: string } | null;
  /** Her latest record is still waiting on a check (Pending / Probable / blank) - she's already on the sheet. */
  waiting: boolean;
  /** ...and she shows on the list as it's filtered now. */
  onList: boolean;
};

const TONE: Record<string, string> = { Safe: "st-Safe", Open: "st-Open", Probable: "st-Probable" };
const BTN: Record<string, string> = {
  Probable: "border-amber-400 bg-amber-300 text-amber-950",
  Safe: "border-green-600 bg-green-500 text-white",
  Open: "border-red-600 bg-red-600 text-white",
};

/**
 * "+ Add cow" on Preg Check (Carter, 2026-10-16 - one box, simple): type her Cow ID and the form looks her up.
 *  - Already on the sheet waiting on a check: says so, with her result buttons right there - no second line for her.
 *  - On record otherwise: her most recent info (mating, owner, type, grade, company) fills in to keep or change.
 *  - Not on record: a Cow ID alone is enough.
 * The group always starts blank - nothing from the page is filled in.
 */
export function AddPregCow({ lists, cows }: { lists: Lists; cows: Record<string, KnownCow> }) {
  const router = useRouter();
  const blank = { batch: "", cowId: "", mating: "", owner: "", embryoType: "", grade: "", company: "", dueOverride: "", notes: "" };
  const [open, setOpen] = useState(false);
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  // Exact Cow ID (any case), or 54 for 054 when only one cow fits. A partial match never fills anything in.
  const match = findCowId(Object.keys(cows), f.cowId).id;
  const her = match ? cows[match] : undefined;
  const typeId = (v: string) => {
    const m = findCowId(Object.keys(cows), v).id;
    const k = m ? cows[m] : undefined;
    // Her most recent info fills in when she's found; it clears again if the Cow ID changes to another cow.
    setF(k ? { ...f, cowId: v, mating: k.mating, owner: k.owner, embryoType: k.embryoType, grade: k.grade, company: k.company } : { ...blank, cowId: v, notes: f.notes, dueOverride: f.dueOverride });
  };
  const pick = async (result: string) => {
    if (!her) return;
    setBusy(true);
    try {
      await post("/api/preg", { action: "draft", id: her.id, result: her.pregDraft === result ? "" : result });
      toast(her.pregDraft === result ? `Result taken off cow ${match}.` : `Cow ${match}: ${result}. It's confirmed with the rest at Confirm & Archive.`);
      router.refresh();
    } catch (x) {
      toast((x as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

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
        className="card relative mt-12 w-full max-w-lg p-5"
        onClick={(e) => e.stopPropagation()}
        onSubmit={async (e) => {
          e.preventDefault();
          if (her?.waiting) return;
          setBusy(true);
          try {
            await post("/api/transfers", { action: "addPreg", row: f });
            toast(`Cow ${f.cowId} added to the sheet.`);
            setF(blank);
            router.refresh();
          } catch (x) {
            toast((x as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        <button type="button" className="absolute right-3 top-2 text-2xl font-bold leading-none text-slate-400 hover:text-red-600" onClick={() => setOpen(false)} aria-label="Close" title="Close">
          ✕
        </button>
        <h2 className="mb-1 text-base font-semibold">Add a cow to the preg check sheet</h2>
        <p className="mb-3 text-xs text-slate-500">Type her Cow ID first - if she&apos;s on record, her status shows and her most recent info fills in. Only the Cow ID is needed to add her.</p>
        <label className="mb-2 block text-xs font-medium text-slate-600">
          Cow ID
          <input className="field mt-0.5 w-40 text-base font-semibold" value={f.cowId} onChange={(e) => typeId(e.target.value)} autoFocus required autoComplete="off" />
        </label>

        {her && (
          <div className={"mb-3 rounded-md border p-3 text-sm " + (her.waiting ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-slate-50")}>
            <div>
              Cow <b>{match}</b> on record:{" "}
              {her.pregDraft ? (
                <>
                  <b className={TONE[her.pregDraft] ?? ""}>{her.pregDraft}</b> <span className="text-xs text-slate-500">(was {her.status || "blank"} - confirm with the rest)</span>
                </>
              ) : (
                <b className={TONE[her.status] ?? ""}>{her.status || "(blank)"}</b>
              )}
              {her.batch ? ` · group ${her.batch}` : " · no group"}
              {her.lastCheck && (
                <>
                  {" "}
                  · last checked {showDate(her.lastCheck.date)} <b className={TONE[her.lastCheck.result] ?? ""}>{her.lastCheck.result}</b>
                </>
              )}
            </div>
            {her.waiting && (
              <>
                <p className="mt-1 font-semibold text-amber-900">
                  She&apos;s already on the sheet{her.batch ? ` in group ${her.batch}` : ""}, waiting on her check{her.onList ? " - on the list below." : " (not on the list showing now - different Group or ages)."} Put her result in here:
                </p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {resultsFor(her.status, her.pregDraft).map((r) => (
                    <button
                      key={r}
                      type="button"
                      disabled={busy}
                      onClick={() => pick(r)}
                      className={"rounded-md border-2 px-4 py-2 text-sm font-bold " + (her.pregDraft === r ? BTN[r] + " ring-2 ring-slate-900" : "border-slate-300 bg-white text-slate-700")}
                    >
                      {r}
                    </button>
                  ))}
                  {her.pregDraft && <span className="text-xs text-slate-500">Tap it again to take it off.</span>}
                </div>
              </>
            )}
          </div>
        )}

        {!her?.waiting && (
          <div className="grid grid-cols-2 gap-3">
            <label className="text-xs font-medium text-slate-600">
              Group
              <select className="field mt-0.5" value={f.batch} onChange={set("batch")}>
                <option value="">(no group)</option>
                {lists.batches.map((b) => (
                  <option key={b}>{b}</option>
                ))}
              </select>
            </label>
            {box("dueOverride", "Due Date (if different)", undefined, "date")}
            {box("mating", "Mating", undefined, "text", true)}
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
            <p className="col-span-2 text-xs text-slate-500">With no group she shows on the sheet whatever Group or ages are picked. With a group, her Due Date is its transfer date + 276 unless you type one.</p>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" className="btn-quiet" onClick={() => setOpen(false)}>
            Done
          </button>
          {!her?.waiting && (
            <button className="btn-go" disabled={busy || !f.cowId.trim()}>
              {busy ? "Adding..." : "Add to sheet"}
            </button>
          )}
        </div>
      </form>
    </div>
  );
}
