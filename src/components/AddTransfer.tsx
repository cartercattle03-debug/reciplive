"use client";
import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { post, toast } from "./ui";
import { EMBRYO_TYPES, STATUSES } from "@/lib/recip";

type Lists = { batches: string[]; owners: string[]; companies: string[]; grades: string[] };

/**
 * Add a transfer (or a Pass) at the end of the list. Group, Mating, Owner, Type, Grade and Company stay filled
 * for the next cow, so a whole flush goes in with just Cow IDs.
 */
export function AddTransfer({ lists }: { lists: Lists }) {
  const router = useRouter();
  const blank = { batch: lists.batches[lists.batches.length - 1] ?? "", cowId: "", mating: "", owner: "", embryoType: "", grade: "", company: "", status: "Pending", notes: "" };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const cowRef = useRef<HTMLInputElement>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });
  const pass = f.status === "Pass";
  const box = (k: keyof typeof f, label: string, list?: string[], w = "w-28") => (
    <label className="text-xs font-medium text-slate-600">
      {label}
      <input className={"field mt-0.5 " + w} value={f[k]} onChange={set(k)} list={list ? `dl-${k}` : undefined} disabled={pass && k !== "cowId" && k !== "notes"} />
      {list && (
        <datalist id={`dl-${k}`}>
          {list.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      )}
    </label>
  );
  return (
    <form
      className="card no-print mb-4 flex flex-wrap items-end gap-3 p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!f.cowId.trim()) return;
        setBusy(true);
        try {
          const row = pass ? { batch: f.batch, cowId: f.cowId, status: "Pass", notes: f.notes } : f;
          await post("/api/transfers", { action: "add", rows: [row] });
          toast(`Cow ${f.cowId} added.`);
          setF({ ...f, cowId: "", notes: "" });
          router.refresh();
          cowRef.current?.focus();
        } catch (x) {
          toast((x as Error).message, true);
        } finally {
          setBusy(false);
        }
      }}
    >
      <span className="w-full text-xs font-semibold uppercase tracking-wide text-slate-500">Add a transfer</span>
      <label className="text-xs font-medium text-slate-600">
        Group
        <select className="field mt-0.5 w-24" value={f.batch} onChange={set("batch")}>
          {lists.batches.map((b) => (
            <option key={b}>{b}</option>
          ))}
        </select>
      </label>
      <label className="text-xs font-medium text-slate-600">
        Cow ID
        <input ref={cowRef} className="field mt-0.5 w-24" value={f.cowId} onChange={set("cowId")} required />
      </label>
      <label className="text-xs font-medium text-slate-600">
        Status
        <select className="field mt-0.5 w-28" value={f.status} onChange={set("status")}>
          {STATUSES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {box("mating", "Mating", undefined, "w-40")}
      {box("owner", "Owner", lists.owners)}
      <label className="text-xs font-medium text-slate-600">
        Embryo Type
        <select className="field mt-0.5 w-24" value={f.embryoType} onChange={set("embryoType")} disabled={pass}>
          <option value=""></option>
          {EMBRYO_TYPES.map((s) => (
            <option key={s}>{s}</option>
          ))}
        </select>
      </label>
      {box("grade", "Grade", lists.grades, "w-20")}
      {box("company", "Company", lists.companies)}
      {box("notes", "Notes", undefined, "w-40")}
      <button className="btn" disabled={busy || !f.batch}>
        {busy ? "Adding..." : "Add"}
      </button>
      {pass && <span className="w-full text-xs text-slate-500">A Pass is a chute visit with no transfer: just Group and Cow ID. It counts toward her attempts and puts her on Open Inventory.</span>}
      {!lists.batches.length && <span className="w-full text-xs text-red-700">Add a Group (batch) on the Lists page first.</span>}
    </form>
  );
}
