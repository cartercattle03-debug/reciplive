"use client";
import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ask, post, toast } from "./ui";
import { EMBRYO_TYPES, showDate } from "@/lib/recip";
import { dateFromLabel } from "@/lib/groupDate";

/** A new transfer starts Pending, as a Pass, or Culled (Carter, 2026-10-14). */
const NEW_STATUSES = ["Pending", "Pass", "Culled"] as const;

type Lists = { batches: string[]; owners: string[]; companies: string[]; grades: string[] };
const NEW = "__new";

type Line = { cowId: string; mating: string; owner: string; embryoType: string; grade: string; company: string; status: string; notes: string };
const COLS: { k: keyof Line; label: string; w: string; list?: "owners" | "companies" | "grades"; pick?: readonly string[] }[] = [
  { k: "cowId", label: "Cow ID", w: "w-20" },
  { k: "mating", label: "Mating", w: "w-40" },
  { k: "owner", label: "Owner", w: "w-28", list: "owners" },
  { k: "embryoType", label: "Embryo Type", w: "w-24", pick: EMBRYO_TYPES },
  { k: "grade", label: "Grade", w: "w-16", list: "grades" },
  { k: "company", label: "Company", w: "w-24", list: "companies" },
  { k: "status", label: "Status", w: "w-28", pick: NEW_STATUSES },
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
export function AddTransfer({ lists, start, dates, year }: { lists: Lists; /** The group picked to start with (the year's newest). */ start?: string; /** Each group's transfer date (Lists). */ dates: Record<string, string | null>; /** The Year box - a new group's label is read in this year. */ year: number }) {
  const router = useRouter();
  const [pickB, setPickB] = useState(start ?? lists.batches[lists.batches.length - 1] ?? NEW);
  const [newLabel, setNewLabel] = useState("");
  const isNew = pickB === NEW;
  const batch = isNew ? newLabel.trim() : pickB;
  const listed = isNew ? undefined : dates[pickB];
  // The transfer date fills itself in: the group's date from Lists, or read from the label (7-31 = 7/31 of the year).
  const [typedDate, setTypedDate] = useState<{ for: string; d: string } | null>(null);
  const tDate = listed || (typedDate?.for === batch ? typedDate.d : dateFromLabel(batch, year));
  const [rows, setRows] = useState<Line[]>(lines(10));
  const [busy, setBusy] = useState(false);
  const [bad, setBad] = useState<number[]>([]);
  // Lines typed but not added yet are kept in this browser, so an update, a refresh or closing the page can't lose them
  // (Carter, 2026-10-16: a whole sheet of lines was lost when the site updated). Cleared once they're added, or by Clear.
  const KEEP = "rl_addTransfer_v1";
  const restored = useRef(false);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(KEEP);
      if (raw) {
        const k = JSON.parse(raw) as { rows?: Line[]; pickB?: string; newLabel?: string; typedDate?: { for: string; d: string } | null };
        const kept = (k.rows ?? []).filter(used);
        if (kept.length) {
          const out = [...(k.rows ?? [])];
          while (out.length < 10 || out.length % 10) out.push(blankLine());
          setRows(out);
          if (k.pickB && (k.pickB === NEW || lists.batches.includes(k.pickB))) setPickB(k.pickB);
          if (k.newLabel) setNewLabel(k.newLabel);
          if (k.typedDate) setTypedDate(k.typedDate);
          toast(`Brought back ${kept.length} line${kept.length === 1 ? "" : "s"} you hadn't added yet.`);
        }
      }
    } catch {
      /* nothing kept, or this browser won't keep it - start blank */
    }
    restored.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored.current) return;
    try {
      if (rows.some(used)) localStorage.setItem(KEEP, JSON.stringify({ rows, pickB, newLabel, typedDate }));
      else localStorage.removeItem(KEEP);
    } catch {
      /* can't keep it in this browser */
    }
  }, [rows, pickB, newLabel, typedDate]);
  const filled = rows.filter(used);

  /** Arrow keys move between boxes like a sheet (Carter, 2026-10-16); a greyed-out box (a Pass line) is stepped over. */
  const go = (i: number, k: keyof Line, dr: number, dc: number) => {
    let r = i;
    let c = COLS.findIndex((x) => x.k === k);
    for (let n = 0; n < 40; n++) {
      r += dr;
      c += dc;
      if (c < 0 || c >= COLS.length || r < 0) return;
      const el = document.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-cell="${r}-${COLS[c].k}"]`);
      if (!el) return;
      if (!el.disabled) {
        el.focus();
        if (el instanceof HTMLInputElement) el.select();
        return;
      }
    }
  };
  const arrows = (i: number, k: keyof Line) => (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    const el = e.currentTarget;
    const isInput = el instanceof HTMLInputElement;
    const atStart = !isInput || (el.selectionStart === 0 && el.selectionEnd === 0);
    const atEnd = !isInput || (el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
    if (e.key === "ArrowLeft" && atStart) (e.preventDefault(), go(i, k, 0, -1));
    else if (e.key === "ArrowRight" && atEnd) (e.preventDefault(), go(i, k, 0, 1));
    // Up / Down change a pick list's choice, so only typed boxes move rows with them.
    else if (isInput && e.key === "ArrowUp") (e.preventDefault(), go(i, k, -1, 0));
    else if (isInput && e.key === "ArrowDown") (e.preventDefault(), go(i, k, 1, 0));
  };
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
    if (!batch) return toast("Type the new group's label (e.g. 7-31).", true);
    if (!tDate) return toast(`Pick the transfer date for group ${batch}.`, true);
    if (!(await ask(`Add ${filled.length} transfer${filled.length === 1 ? "" : "s"} to group ${batch} (transferred ${showDate(tDate)})?${isNew ? `\n\nGroup ${batch} is new - it goes on the Lists page with that date.` : ""}`, `Add ${filled.length}`))) return;
    setBusy(true);
    try {
      const r = await post("/api/transfers", {
        action: "add",
        group: { label: batch, transferDate: tDate },
        rows: filled.map((l) => (l.status === "Pass" ? { batch, cowId: l.cowId, status: "Pass", notes: l.notes } : { batch, ...l })),
      });
      toast(`${r.added} transfers added to ${batch}.`);
      setRows(lines(10));
      setBad([]);
      if (isNew) {
        setPickB(batch);
        setNewLabel("");
      }
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
          <select className="field mt-0.5 w-32" value={pickB} onChange={(e) => setPickB(e.target.value)}>
            {lists.batches.map((b) => (
              <option key={b}>{b}</option>
            ))}
            <option value={NEW}>+ New group</option>
          </select>
        </label>
        {isNew && (
          <label className="text-xs font-medium text-slate-600">
            New group label
            <input className="field mt-0.5 w-24" placeholder="7-31" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} />
          </label>
        )}
        <label className="text-xs font-medium text-slate-600" title={listed ? "This group's date from the Lists page - change it there" : "Filled in from the group label - change it if it's off"}>
          Transfer Date
          {listed ? (
            <span className="field mt-0.5 block w-36 bg-slate-50">{showDate(listed)}</span>
          ) : (
            <input type="date" className="field mt-0.5 block w-40" value={tDate} onChange={(e) => setTypedDate({ for: batch, d: e.target.value })} />
          )}
        </label>
        <span className="max-w-xl text-xs text-slate-500">
          Every line goes into this group and its transfer date ({listed ? "from Lists" : "read from the label - 7-31 is 7/31/" + year}). Paste a column straight from a sheet into the first box and it fills down. ↓ copies the top value down the lines in use. A Pass needs only the Cow ID. Any one record&apos;s group can be changed afterward in the list below.
        </span>
      </div>
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
                  <td className="whitespace-nowrap px-1 text-xs text-slate-400">
                    <button
                      type="button"
                      title="Clear this line"
                      aria-label={`Clear line ${i + 1}`}
                      className="mr-1 rounded px-1 text-base font-bold leading-none text-red-600 hover:bg-red-50"
                      onClick={() => setRows((rs) => {
                        const out = rs.filter((_, j) => j !== i);
                        while (out.length < 10 || out.length % 10) out.push(blankLine());
                        return out;
                      })}
                    >
                      ✕
                    </button>
                    {i + 1}
                  </td>
                  {COLS.map((c) => (
                    <td key={c.k} className="px-0.5 py-0.5">
                      {c.pick ? (
                        <select className={"field px-1 py-1 " + c.w} value={r[c.k]} disabled={pass && c.k !== "status"} onChange={(e) => set(i, c.k, e.target.value)} onKeyDown={arrows(i, c.k)} data-cell={`${i}-${c.k}`}>
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
                            arrows(i, c.k)(e);
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
