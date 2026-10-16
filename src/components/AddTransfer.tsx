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
  // Highlight a run of boxes down a column (drag, or Shift + up / down arrow), then paste or use the Fill bar to put the
  // same thing in all of them (Carter, 2026-10-16: fill like cells in a new batch before it's added).
  const [gsel, setGsel] = useState<{ k: keyof Line; r1: number; r2: number } | null>(null);
  const [gfill, setGfill] = useState("");
  const gdrag = useRef<{ k: keyof Line; r0: number; moved?: boolean } | null>(null);
  const many = !!gsel && gsel.r2 > gsel.r1;
  const gEnd = useRef<{ anchor: number; to: number } | null>(null);
  const locked = (r: Line, k: keyof Line) => r.status === "Pass" && k !== "cowId" && k !== "notes" && k !== "status";
  const fillRun = (vals: string[]) => {
    if (!gsel) return;
    const col = COLS.find((c) => c.k === gsel.k)!;
    const fit = (v: string) => (col.pick ? col.pick.find((o) => o.toLowerCase() === v.trim().toLowerCase()) ?? null : v.trim());
    let skipped = 0;
    setRows((rs) => {
      const out = [...rs];
      const n = vals.length === 1 ? gsel.r2 - gsel.r1 + 1 : vals.length;
      while (out.length < gsel.r1 + n) out.push(blankLine());
      for (let j = 0; j < n; j++) {
        const r = gsel.r1 + j;
        const v = fit(vals.length === 1 ? vals[0] : vals[j]);
        if (v === null || locked(out[r], gsel.k)) {
          skipped++;
          continue;
        }
        out[r] = { ...out[r], [gsel.k]: v };
      }
      while (out.length % 10) out.push(blankLine());
      return out;
    });
    toast(skipped ? `Filled - ${skipped} box${skipped === 1 ? "" : "es"} skipped (not one of the choices, or a Pass line).` : `Filled ${col.label} on ${vals.length === 1 ? gsel.r2 - gsel.r1 + 1 : vals.length} lines.`);
    setGfill("");
  };
  // The Fill bar starts with what the top highlighted box says - highlight from a filled box down, press Enter, done.
  useEffect(() => {
    if (gsel && gsel.r2 > gsel.r1) setGfill(rows[gsel.r1]?.[gsel.k] ?? "");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gsel?.k, gsel?.r1, gsel && gsel.r2 > gsel.r1]);
  const fillRef = useRef(fillRun);
  fillRef.current = fillRun;
  const gselRef = useRef(gsel);
  gselRef.current = gsel;
  useEffect(() => {
    const move = (ev: MouseEvent) => {
      const d = gdrag.current;
      if (!d || !(ev.buttons & 1)) return;
      const el = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest<HTMLElement>("[data-gk]");
      if (!el || el.dataset.gk !== d.k) return;
      const r = Number(el.dataset.gr);
      if (r === d.r0 && !d.moved) return;
      if (!d.moved) (document.activeElement as HTMLElement | null)?.blur?.();
      d.moved = true;
      ev.preventDefault();
      window.getSelection()?.removeAllRanges();
      document.body.style.userSelect = "none";
      setGsel({ k: d.k, r1: Math.min(d.r0, r), r2: Math.max(d.r0, r) });
    };
    const up = () => {
      gdrag.current = null;
      document.body.style.userSelect = "";
    };
    // Paste onto the highlighted boxes, wherever the keyboard is (Safari doesn't keep it on the box).
    const paste = (ev: ClipboardEvent) => {
      const s = gselRef.current;
      if (!s || s.r2 <= s.r1 || !ev.clipboardData || ev.defaultPrevented) return;
      const a = document.activeElement as HTMLElement | null;
      if (a && a !== document.body && !a.closest("[data-gk]")) return; // typing somewhere else on the page
      const vals = ev.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((l) => l.split("\t")[0]);
      ev.preventDefault();
      fillRef.current(vals);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    document.addEventListener("paste", paste);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.removeEventListener("paste", paste);
    };
  }, []);
  const arrows = (i: number, k: keyof Line) => (e: React.KeyboardEvent<HTMLInputElement | HTMLSelectElement>) => {
    if (e.key === "Escape") return setGsel(null);
    if (e.shiftKey && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
      // The box with the keyboard stays the anchor; each press moves the far end of the run up or down.
      e.preventDefault();
      if (!gsel || gsel.k !== k || !gEnd.current) gEnd.current = { anchor: i, to: i };
      const g = gEnd.current;
      g.to = Math.max(0, Math.min(rows.length - 1, g.to + (e.key === "ArrowDown" ? 1 : -1)));
      setGsel({ k, r1: Math.min(g.anchor, g.to), r2: Math.max(g.anchor, g.to) });
      return;
    }
    if (many && e.key === "Enter") {
      e.preventDefault();
      e.stopPropagation();
      fillRun([gfill]);
      return;
    }
    if (e.key.startsWith("Arrow")) {
      gEnd.current = null;
      if (many) setGsel(null);
    }
    const el = e.currentTarget;
    const isInput = el instanceof HTMLInputElement;
    const atStart = !isInput || (el.selectionStart === 0 && el.selectionEnd === 0);
    const atEnd = !isInput || (el.selectionStart === el.value.length && el.selectionEnd === el.value.length);
    if (e.key === "ArrowLeft" && atStart) (e.preventDefault(), go(i, k, 0, -1));
    else if (e.key === "ArrowRight" && atEnd) (e.preventDefault(), go(i, k, 0, 1));
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
      {COLS.filter((c) => c.pick).map((c) => (
        <datalist key={c.k} id={`dl-pick-${c.k}`}>
          {c.pick!.map((o) => (
            <option key={o} value={o} />
          ))}
        </datalist>
      ))}
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
                    <td
                      key={c.k}
                      data-gk={c.k}
                      data-gr={i}
                      className={"px-0.5 py-0.5 " + (gsel && many && gsel.k === c.k && i >= gsel.r1 && i <= gsel.r2 ? "rounded bg-sky-200 ring-2 ring-brand-600" : "")}
                      onMouseDownCapture={(ev) => {
                        if (ev.button !== 0) return;
                        if (ev.shiftKey && gsel && gsel.k === c.k) {
                          ev.preventDefault();
                          setGsel({ k: c.k, r1: Math.min(gsel.r1, i), r2: Math.max(gsel.r2, i) });
                          return;
                        }
                        gdrag.current = { k: c.k, r0: i };
                        gEnd.current = null;
                        setGsel({ k: c.k, r1: i, r2: i });
                      }}
                    >
                      {c.pick ? (
                        // A typed box with its choices offered (not a pop-up list), so it highlights, fills and pastes like
                        // the rest (Carter, 2026-10-16). "fr" -> Fresh / Frozen as you type; anything else is taken back off.
                        <input
                          className={"field px-1 py-1 " + c.w}
                          value={r[c.k]}
                          list={`dl-pick-${c.k}`}
                          disabled={pass && c.k !== "status"}
                          onChange={(e) => set(i, c.k, e.target.value)}
                          onBlur={(e) => {
                            const v = e.target.value.trim();
                            if (!v) return;
                            const hit = c.pick!.find((o) => o.toLowerCase() === v.toLowerCase()) ?? (c.pick!.filter((o) => o.toLowerCase().startsWith(v.toLowerCase())).length === 1 ? c.pick!.find((o) => o.toLowerCase().startsWith(v.toLowerCase())) : undefined);
                            if (hit) set(i, c.k, hit);
                            else {
                              set(i, c.k, c.k === "status" ? "Pending" : "");
                              toast(`${c.label} is ${c.pick!.join(", ")}.`, true);
                            }
                          }}
                          onKeyDown={(e) => {
                            arrows(i, c.k)(e);
                          }}
                          data-cell={`${i}-${c.k}`}
                        />
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
                            if (e.defaultPrevented) return; // already moved, or filled a highlighted run
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
      {gsel && many && (
        <div className="fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-lg border-2 border-brand-600 bg-sky-50 px-4 py-3 text-sm shadow-xl">
          <b>
            {COLS.find((c) => c.k === gsel.k)?.label}: lines {gsel.r1 + 1} to {gsel.r2 + 1} picked.
          </b>
          <span>Fill them with:</span>
          {(() => {
            const col = COLS.find((c) => c.k === gsel.k)!;
            return col.pick ? (
              <select className="field w-40" value={gfill} onChange={(ev) => setGfill(ev.target.value)}>
                <option value=""></option>
                {col.pick.map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input className="field w-48" value={gfill} list={col.list ? `dl-${col.list}` : undefined} placeholder="Type, then Fill" onChange={(ev) => setGfill(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && (ev.preventDefault(), fillRun([gfill]))} />
            );
          })()}
          <button type="button" className="btn" onClick={() => fillRun([gfill])}>
            Fill
          </button>
          <span className="text-xs text-slate-500">or paste (Cmd+V / Ctrl+V)</span>
          <button type="button" className="btn-quiet ml-auto" onClick={() => (setGsel(null), setGfill(""))}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}
