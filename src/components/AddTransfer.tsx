"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ask, post, toast } from "./ui";
import { EMBRYO_TYPES, STATUSES } from "@/lib/recip";

type Lists = { batches: string[]; owners: string[]; companies: string[]; grades: string[] };
type Line = { cowId: string; mating: string; owner: string; embryoType: string; grade: string; company: string; status: string; notes: string };
const COLS: { k: keyof Line; label: string; w: string; list?: "owners" | "companies" | "grades"; pick?: readonly string[] }[] = [
  { k: "cowId", label: "Cow ID", w: "w-20" },
  { k: "mating", label: "Mating", w: "w-40" },
  { k: "owner", label: "Owner", w: "w-28", list: "owners" },
  { k: "embryoType", label: "Embryo Type", w: "w-24", pick: EMBRYO_TYPES },
  { k: "grade", label: "Grade", w: "w-16", list: "grades" },
  { k: "company", label: "Company", w: "w-24", list: "companies" },
  { k: "status", label: "Status", w: "w-28", pick: STATUSES },
  { k: "notes", label: "Notes", w: "w-36" },
];
const blankLine = (): Line => ({ cowId: "", mating: "", owner: "", embryoType: "", grade: "", company: "", status: "Pending", notes: "" });
const lines = (n: number) => Array.from({ length: n }, blankLine);
/** A line is used once anything but its Status is typed. */
const used = (l: Line) => COLS.some((c) => c.k !== "status" && l[c.k].trim());

/**
 * Add a whole batch at once: 10 lines to start, "+ 10 more lines" as needed, one Add button for all of them.
 * Pasting a column copied from a sheet (Cow IDs, matings ...) into any box fills that column on down, adding lines as it goes.
 */
export function AddTransfer({ lists }: { lists: Lists }) {
  const router = useRouter();
  const [batch, setBatch] = useState(lists.batches[lists.batches.length - 1] ?? "");
  const [rows, setRows] = useState<Line[]>(lines(10));
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<number[]>([]);
  const filled = rows.filter(used);

  const set = (i: number, k: keyof Line, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const paste = (i: number, k: keyof Line, e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData("text");
    if (!/[\n\t]/.test(text.trim())) return; // a single value pastes the normal way
    e.preventDefault();
    const grid = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t"));
    const start = COLS.findIndex((c) => c.k === k);
    setRows((rs) => {
      const out = [...rs];
      while (out.length < i + grid.length) out.push(blankLine());
      grid.forEach((cells, r) =>
        cells.forEach((v, c) => {
          const col = COLS[start + c];
          if (col) out[i + r] = { ...out[i + r], [col.k]: v.trim() };
        })
      );
      while (out.length % 10) out.push(blankLine());
      return out;
    });
    toast(`Pasted ${grid.length} line${grid.length === 1 ? "" : "s"}.`);
  };
  /** Copies the first line's value down every used line below that left it blank. */
  const copyDown = (k: keyof Line) => {
    const v = rows.find((r) => r[k].trim())?.[k];
    if (!v) return toast("Type it on the first line, then copy it down.", true);
    setRows((rs) => rs.map((r) => (used(r) && !r[k].trim() ? { ...r, [k]: v } : r)));
  };

  const save = async () => {
    const missing = rows.map((r, i) => (used(r) && !r.cowId.trim() ? i : -1)).filter((i) => i >= 0);
    setBad(missing);
    if (missing.length) return toast(`${missing.length} line${missing.length === 1 ? " has" : "s have"} no Cow ID - fill it in or clear the line.`, true);
    if (!filled.length) return toast("Type at least one Cow ID.", true);
    if (!(await ask(`Add ${filled.length} transfer${filled.length === 1 ? "" : "s"} to group ${batch}?`, `Add ${filled.length}`))) return;
    setBusy(true);
    try {
      const r = await post("/api/transfers", {
        action: "add",
        rows: filled.map((l) => (l.status === "Pass" ? { batch, cowId: l.cowId, status: "Pass", notes: l.notes } : { batch, ...l })),
      });
      toast(`${r.added} transfers added to ${batch}.`);
      setRows(lines(10));
      setBad([]);
      router.refresh();
    } catch (e) {
      toast((e as Error).message, true);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="card no-print edit-only mb-4 p-3">
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500">Add transfers</span>
        <label className="text-xs font-medium text-slate-600">
          Group
          <select className="field mt-0.5 w-24" value={batch} onChange={(e) => setBatch(e.target.value)}>
            {lists.batches.map((b) => (
              <option key={b}>{b}</option>
            ))}
          </select>
        </label>
        <span className="max-w-xl text-xs text-slate-500">
          Every line goes into this group. Paste a column straight from a sheet into the first box and it fills down. ↓ copies the top value down the lines in use. A Pass needs only the Cow ID.
        </span>
      </div>
      {!lists.batches.length && <p className="mb-2 text-xs text-red-700">Add a Group (batch) on the Lists page first.</p>}
      {(["owners", "companies", "grades"] as const).map((l) => (
        <datalist key={l} id={`dl-${l}`}>
          {lists[l].map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ))}
      <div className="overflow-x-auto">
        <table className="keep-width text-sm">
          <thead>
            <tr>
              <th className="px-1 text-xs text-slate-400">#</th>
              {COLS.map((c) => (
                <th key={c.k} className="whitespace-nowrap px-1 pb-1 text-xs font-semibold text-slate-600">
                  {c.label}
                  {c.k !== "cowId" && c.k !== "notes" && (
                    <button type="button" className="ml-1 rounded px-1 text-brand-600 hover:bg-brand-50" title={`Copy the top ${c.label} down`} onClick={() => copyDown(c.k)}>
                      ↓
                    </button>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const pass = r.status === "Pass";
              return (
                <tr key={i} className={bad.includes(i) ? "bg-red-50" : ""}>
                  <td className="px-1 text-xs text-slate-400">{i + 1}</td>
                  {COLS.map((c) => (
                    <td key={c.k} className="px-0.5 py-0.5">
                      {c.pick ? (
                        <select className={"field px-1 py-1 " + c.w} value={r[c.k]} disabled={pass && c.k !== "status"} onChange={(e) => set(i, c.k, e.target.value)}>
                          {c.k !== "status" && <option value=""></option>}
                          {c.pick.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : (
                        <input
                          className={"field px-1 py-1 " + c.w + (bad.includes(i) && c.k === "cowId" ? " border-red-500" : "")}
                          value={r[c.k]}
                          list={c.list ? `dl-${c.list}` : undefined}
                          disabled={pass && c.k !== "cowId" && c.k !== "notes"}
                          onChange={(e) => set(i, c.k, e.target.value)}
                          onPaste={(e) => paste(i, c.k, e)}
                          onKeyDown={(e) => {
                            // Enter moves down the same column, like a sheet.
                            if (e.key === "Enter") {
                              e.preventDefault();
                              const next = document.querySelector<HTMLInputElement>(`[data-cell="${i + 1}-${c.k}"]`);
                              if (next) next.focus();
                              else {
                                setRows((rs) => [...rs, ...lines(10)]);
                                setTimeout(() => document.querySelector<HTMLInputElement>(`[data-cell="${i + 1}-${c.k}"]`)?.focus(), 0);
                              }
                            }
                          }}
                          data-cell={`${i}-${c.k}`}
                        />
                      )}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" className="btn-quiet" onClick={() => setRows((rs) => [...rs, ...lines(10)])}>
          + 10 more lines
        </button>
        <button
          type="button"
          className="btn-quiet"
          disabled={!filled.length}
          onClick={async () => (await ask("Clear every line?", "Clear")) && (setRows(lines(10)), setBad([]))}
        >
          Clear
        </button>
        <span className="ml-auto text-xs text-slate-500">{filled.length} line{filled.length === 1 ? "" : "s"} filled</span>
        <button type="button" className="btn-go" disabled={busy || !filled.length || !batch} onClick={save}>
          {busy ? "Adding..." : `Add ${filled.length || ""} transfer${filled.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </div>
  );
}
