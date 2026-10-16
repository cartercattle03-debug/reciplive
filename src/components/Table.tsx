"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ask, post, toast } from "./ui";
import { EditRecord, type EditLists, type RecordValues } from "./EditRecord";

/** What a cell can save to. Kept as plain data so a server page can hand it over. */
export type Edit = {
  api: "transfers" | "cows" | "preg";
  /** transfers / preg: the record id. cows: the Cow ID. */
  id: string;
  field: string;
  /** "buttons": one tap button per option (Preg Check Result) - tap the lit one again to take it back off. */
  kind: "text" | "select" | "date" | "money" | "buttons";
  options?: string[];
  value: string;
};
export type Cell = {
  t: string;
  /** Sort value when it differs from the text (numbers, dates, Cow ID order). */
  s?: string | number;
  edit?: Edit;
  cls?: string;
  href?: string;
  title?: string;
  /** A Delete button for this transfer record (asks first; Undo can bring it back). */
  del?: { id: string; what: string; /** Open list: the red X takes her off the list instead of deleting a record. */ off?: boolean };
  /** A tick box (the record id) - Open Inventory's Cull. */
  pick?: string;
  /** An Edit button opening her record in a pop-up. */
  editRow?: RecordValues;
};
export type Row = { key: string; cells: Cell[]; cls?: string };
export type Col = { label: string; title?: string; noSort?: boolean };

async function save(e: Edit, value: string) {
  if (e.api === "transfers") return post("/api/transfers", { action: "update", id: e.id, field: e.field, value });
  if (e.api === "cows") return post("/api/cows", { cowId: e.id, field: e.field, value });
  if (e.field === "checkDate") return post("/api/preg", { action: "draftDate", id: e.id, date: value });
  return post("/api/preg", { action: "draft", id: e.id, result: value });
}

function DeleteButton({ id, what, off }: { id: string; what: string; off?: boolean }) {
  const router = useRouter();
  if (off)
    return (
      <button
        type="button"
        title={`Take ${what} off the open list`}
        aria-label={`Take ${what} off the open list`}
        className="edit-only rounded px-1.5 text-base font-bold leading-none text-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={async () => {
          if (!(await ask(`Take ${what} off the open list?\n\nUse this for a cow that's gone (sold, died, moved). Her records stay, and the date goes in her Master Archive. To cull her instead, tick Cull.`, "Take her off"))) return;
          try {
            await post("/api/open", { action: "off", cowIds: [id] });
            toast(`${what} is off the open list.`);
            router.refresh();
          } catch (e) {
            toast((e as Error).message, true);
          }
        }}
      >
        ✕
      </button>
    );
  return (
    <button
      type="button"
      title={`Delete ${what}`}
      aria-label={`Delete ${what}`}
      className="edit-only rounded px-1.5 text-base font-bold leading-none text-red-600 hover:bg-red-50 hover:text-red-700"
      onClick={async () => {
        if (!(await ask(`Delete ${what}?\n\nA copy is kept - Account > Undo can bring it back.`, "Delete"))) return;
        try {
          await post("/api/transfers", { action: "delete", id });
          toast("Deleted.");
          router.refresh();
        } catch (e) {
          toast((e as Error).message, true);
        }
      }}
    >
      ✕
    </button>
  );
}

function EditCell({ e, shown }: { e: Edit; shown: string }) {
  const router = useRouter();
  const [val, setVal] = useState(e.value);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState(false);
  // When an edit ends and nothing else took the focus, it comes back to this cell - the arrow keys carry on from here.
  const cellBtn = useRef<HTMLButtonElement>(null);
  const wasEditing = useRef(false);
  useEffect(() => {
    if (editing) wasEditing.current = true;
    else if (wasEditing.current) {
      wasEditing.current = false;
      if (!document.activeElement || document.activeElement === document.body) cellBtn.current?.focus();
    }
  }, [editing]);
  // A fresh value from the server (after a save here or anywhere) shows unless this cell is being typed in.
  useEffect(() => {
    if (!editing) setVal(e.value);
  }, [e.value, editing]);
  const commit = async (v: string) => {
    if (v === e.value) {
      setEditing(false);
      return;
    }
    setBusy(true);
    try {
      await save(e, v);
      setEditing(false);
      router.refresh();
    } catch (err) {
      toast((err as Error).message, true);
      setVal(e.value);
    } finally {
      setBusy(false);
    }
  };
  if (e.kind === "buttons") {
    return (
      <span className="pick-btns inline-flex gap-1">
        {(e.options ?? []).map((o) => {
          const on = val === o;
          return (
            <button
              key={o}
              type="button"
              disabled={busy}
              aria-pressed={on}
              className={"pick-btn pb-" + o + (on ? " on" : "")}
              onClick={() => {
                const next = on ? "" : o;
                setVal(next);
                commit(next);
              }}
            >
              {o}
            </button>
          );
        })}
      </span>
    );
  }
  if (e.kind === "select") {
    // Shown like a typed cell until clicked (so a drag down the column can highlight it), then the pick list opens.
    if (!editing)
      return (
        <button ref={cellBtn} type="button" className="ic" onClick={() => setEditing(true)} title="Click to change">
          {(val !== e.value ? val : shown) || " "}
        </button>
      );
    return (
      <select
        autoFocus
        ref={(el) => {
          if (el && !el.dataset.opened) {
            el.dataset.opened = "1";
            try {
              (el as HTMLSelectElement & { showPicker?: () => void }).showPicker?.();
            } catch {
              /* the browser opens it on the next tap instead */
            }
          }
        }}
        className={"cell-select" + (busy ? " opacity-50" : "")}
        value={val}
        disabled={busy}
        onBlur={() => !busy && setEditing(false)}
        onKeyDown={(ev) => ev.key === "Escape" && setEditing(false)}
        onChange={(ev) => {
          setVal(ev.target.value);
          commit(ev.target.value);
        }}
      >
        <option value=""></option>
        {[...(e.options ?? []), ...(val && !(e.options ?? []).includes(val) ? [val] : [])].map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    );
  }
  if (!editing) {
    return (
      <button ref={cellBtn} type="button" className="ic" onClick={() => setEditing(true)} title="Click to edit">
        {shown || " "}
      </button>
    );
  }
  return (
    <input
      autoFocus
      className="cell-input"
      type={e.kind === "date" ? "date" : "text"}
      inputMode={e.kind === "money" ? "decimal" : undefined}
      value={val}
      disabled={busy}
      onChange={(ev) => setVal(ev.target.value)}
      onBlur={() => commit(val.trim())}
      onKeyDown={(ev) => {
        if (ev.key === "Enter") (ev.target as HTMLInputElement).blur();
        if (ev.key === "Escape") {
          setVal(e.value);
          setEditing(false);
        }
      }}
    />
  );
}

/**
 * The one table every page uses: blue heading row that stays put while scrolling, light blue stripes,
 * click a heading to sort (again to reverse), click a cream cell to change it.
 */
export function Table({
  cols,
  rows,
  empty = "Nothing here yet.",
  search,
  maxHeight = true,
  lists,
  picks,
  startPicked,
}: {
  cols: Col[];
  rows: Row[];
  empty?: string;
  search?: boolean;
  maxHeight?: boolean;
  /** Choices for the Edit pop-up. */
  lists?: EditLists;
  /** What the tick boxes do: one button each, shown once something is ticked. Posts { action, cowIds, ...extra } to url. */
  picks?: { label: string; url: string; action: string; ask: string; danger?: boolean; extra?: Record<string, unknown> }[];
  /** Every row starts ticked (Billing: pick the owner and group, untick what isn't going). */
  startPicked?: boolean;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const allPicks = rows.map((r) => r.cells.find((c) => c.pick)?.pick).filter(Boolean) as string[];
  const [picked, setPicked] = useState<string[]>(startPicked ? allPicks : []);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
  // Copy / paste between cells, like a sheet (Carter, 2026-10-16): click a cell (it's the anchor), shift-click another
  // in the same column to pick the cells between; Ctrl/Cmd+C copies, Ctrl/Cmd+V pastes - one value fills every picked
  // cell, several lines (a column copied from a sheet) fill on down.
  const [anchor, setAnchor] = useState<{ r: number; c: number } | null>(null);
  const [sel, setSel] = useState<{ c: number; r1: number; r2: number } | null>(null);
  const [pasting, setPasting] = useState(false);
  const drag = useRef<{ c: number; r0: number } | null>(null);
  const [fill, setFill] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const extendTo = useRef<number | null>(null);
  /** Focus the cell at row r, column c - the next one that can be changed, stepping the way we're going. */
  const focusCell = (r: number, c: number, dc = 0) => {
    for (let n = 0; n < cols.length + 1; n++) {
      const td = box.current?.querySelector<HTMLElement>(`td[data-r="${r}"][data-c="${c}"]`);
      if (td) {
        const el = td.querySelector<HTMLElement>("button, select, input");
        if (el) {
          el.focus();
          td.scrollIntoView({ block: "nearest", inline: "nearest" });
          return true;
        }
      }
      if (!dc) return false;
      c += dc;
      if (c < 0 || c >= cols.length) return false;
    }
    return false;
  };
  /** Arrow keys move around the cells like a sheet (Carter, 2026-10-16). Enter opens a cell; typing in one, Enter or
   *  Up / Down saves it and moves on. Shift + Up / Down highlights a run down the column to fill. */
  const onKey = (ev: React.KeyboardEvent) => {
    if (ev.key === "Escape") {
      setSel(null);
      return;
    }
    const t = ev.target as HTMLElement;
    const td = t.closest<HTMLElement>("td[data-c]");
    if (!td) return;
    const r = Number(td.dataset.r);
    const c = Number(td.dataset.c);
    const dirs: Record<string, [number, number]> = { ArrowUp: [-1, 0], ArrowDown: [1, 0], ArrowLeft: [0, -1], ArrowRight: [0, 1] };
    if (t.tagName === "INPUT") {
      const dr = ev.key === "ArrowUp" ? -1 : ev.key === "ArrowDown" || ev.key === "Enter" ? 1 : 0;
      if (!dr) return;
      ev.preventDefault();
      (t as HTMLInputElement).blur(); // saves it
      setTimeout(() => focusCell(r + dr, c), 0);
      return;
    }
    if (t.tagName === "SELECT") return; // the arrows choose from its list
    const d = dirs[ev.key];
    if (!d) return;
    ev.preventDefault();
    if (ev.shiftKey && d[0] && anchor && anchor.c === c) {
      const to = Math.max(0, Math.min(shown.length - 1, (extendTo.current ?? anchor.r) + d[0]));
      extendTo.current = to;
      setSel({ c, r1: Math.min(anchor.r, to), r2: Math.max(anchor.r, to) });
      box.current?.querySelector<HTMLElement>(`td[data-r="${to}"][data-c="${c}"]`)?.scrollIntoView({ block: "nearest" });
      return;
    }
    extendTo.current = null;
    focusCell(r + d[0], c + d[1], d[1]);
  };
  useEffect(() => {
    const up = () => (drag.current = null);
    window.addEventListener("mouseup", up);
    return () => window.removeEventListener("mouseup", up);
  }, []);
  const shown = useMemo(() => {
    let out = rows;
    if (q.trim()) {
      const n = q.trim().toLowerCase();
      out = out.filter((r) => r.cells.some((c) => c.t.toLowerCase().includes(n)));
    }
    if (sort) {
      const key = (c: Cell) => (c.s !== undefined ? c.s : c.t);
      out = [...out].sort((a, b) => {
        const x = key(a.cells[sort.i]);
        const y = key(b.cells[sort.i]);
        if (x === y) return 0;
        if (x === "" || x === null) return 1;
        if (y === "" || y === null) return -1;
        return (typeof x === "number" && typeof y === "number" ? x - y : String(x).localeCompare(String(y), undefined, { numeric: true })) * sort.dir;
      });
    }
    return out;
  }, [rows, sort, q]);
  // A new sort / search / page of rows moves the cells under the selection - start fresh.
  useEffect(() => {
    setSel(null);
    setAnchor(null);
  }, [sort, q, rows]);
  const pastable = (r: number, c: number) => {
    const e = shown[r]?.cells[c]?.edit;
    return e && e.kind !== "buttons" ? e : undefined;
  };
  const viewOnly = () => typeof document !== "undefined" && !!document.querySelector("[data-view]");
  const onCopy = (ev: React.ClipboardEvent) => {
    const t = ev.target as HTMLElement;
    if (t.tagName === "INPUT" && (t as HTMLInputElement).selectionStart !== (t as HTMLInputElement).selectionEnd) return; // copying typed text
    if (!sel) return;
    const vals: string[] = [];
    for (let r = sel.r1; r <= sel.r2; r++) vals.push(pastable(r, sel.c)?.value ?? shown[r]?.cells[sel.c]?.t ?? "");
    ev.clipboardData.setData("text/plain", vals.join("\n"));
    ev.preventDefault();
    toast(vals.length === 1 ? `Copied "${vals[0]}".` : `Copied ${vals.length} cells.`);
  };
  const fillAll = async (v: string) => {
    if (!sel || viewOnly()) return;
    const todo: Edit[] = [];
    for (let r = sel.r1; r <= sel.r2; r++) {
      const e = pastable(r, sel.c);
      if (e && e.value !== v) todo.push(e);
    }
    if (!todo.length) return toast("They already say that.");
    setPasting(true);
    let done = 0;
    try {
      for (const e of todo) {
        await save(e, v);
        done++;
      }
      toast(`Filled ${done} cell${done === 1 ? "" : "s"}.`);
      setFill("");
    } catch (err) {
      toast(`${done ? `Filled ${done}, then: ` : ""}${(err as Error).message}`, true);
    } finally {
      setPasting(false);
      router.refresh();
    }
  };
  const onPaste = async (ev: React.ClipboardEvent) => {
    if (!sel || viewOnly()) return;
    const text = ev.clipboardData.getData("text/plain").replace(/\r/g, "").replace(/\n+$/, "");
    const lines = text.split("\n").map((l) => l.split("\t")[0].trim());
    const t = ev.target as HTMLElement;
    const many = sel.r2 > sel.r1;
    if (t.tagName === "INPUT" && lines.length === 1 && !many) return; // typing in one cell - paste as normal
    ev.preventDefault();
    const todo: { e: Edit; v: string }[] = [];
    if (lines.length === 1) for (let r = sel.r1; r <= sel.r2; r++) todo.push({ e: pastable(r, sel.c)!, v: lines[0] });
    else lines.forEach((v, k) => todo.push({ e: pastable(sel.r1 + k, sel.c)!, v }));
    const real = todo.filter((x) => x.e && x.e.value !== x.v);
    if (!real.length) return;
    setPasting(true);
    let done = 0;
    try {
      for (const x of real) {
        await save(x.e, x.v);
        done++;
      }
      toast(`Pasted into ${done} cell${done === 1 ? "" : "s"}.`);
    } catch (err) {
      toast(`${done ? `Pasted ${done}, then: ` : ""}${(err as Error).message}`, true);
    } finally {
      setPasting(false);
      router.refresh();
    }
  };
  return (
    <div ref={box} onCopy={onCopy} onPaste={onPaste} onKeyDown={onKey}>
      {(search || picks) && (
        <div className="no-print mb-2 flex flex-wrap items-center gap-2">
          {search && <input className="field max-w-xs" placeholder="Find in this list..." value={q} onChange={(e) => setQ(e.target.value)} />}
          {q && <span className="text-xs text-slate-500">{shown.length} of {rows.length}</span>}
          {picks && picked.length > 0 && (
            <span className="edit-only ml-auto flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-500">{picked.length} ticked</span>
              <button type="button" className="btn-quiet" onClick={() => setPicked([])}>
                Untick all
              </button>
              {picks.map((p) => (
                <button
                  key={p.action}
                  type="button"
                  className={p.danger ? "btn-danger border-red-600 bg-red-600 text-white hover:bg-red-700" : "btn"}
                  disabled={busy}
                  onClick={async () => {
                    if (!(await ask(p.ask.replace("{n}", String(picked.length)).replace("{names}", picked.join(", ")), `${p.label} (${picked.length} cow${picked.length === 1 ? "" : "s"})`))) return;
                    setBusy(true);
                    try {
                      await post(p.url, { action: p.action, cowIds: picked, unpicked: allPicks.filter((x) => !picked.includes(x)), ...(p.extra ?? {}) });
                      toast(`Done - ${picked.length} cow${picked.length === 1 ? "" : "s"}.`);
                      setPicked([]);
                      router.refresh();
                    } catch (e) {
                      toast((e as Error).message, true);
                    } finally {
                      setBusy(false);
                    }
                  }}
                >
                  {p.label} ({picked.length} cow{picked.length === 1 ? "" : "s"})
                </button>
              ))}
            </span>
          )}
        </div>
      )}
      {sel && sel.r2 > sel.r1 && pastable(sel.r1, sel.c) && !viewOnly() && (
        // Floats at the bottom of the screen - it never pushes the rows around mid-drag.
        <div className="no-print edit-only fixed inset-x-3 bottom-3 z-40 mx-auto flex max-w-3xl flex-wrap items-center gap-2 rounded-lg border-2 border-brand-600 bg-sky-50 px-4 py-3 text-sm shadow-xl">
          <b>
            {sel.r2 - sel.r1 + 1} {cols[sel.c]?.label} cells picked.
          </b>
          <span>Fill them with:</span>
          {(() => {
            const e = pastable(sel.r1, sel.c)!;
            return e.kind === "select" ? (
              <select className="field w-44" value={fill} onChange={(ev) => setFill(ev.target.value)}>
                <option value=""></option>
                {(e.options ?? []).map((o) => (
                  <option key={o}>{o}</option>
                ))}
              </select>
            ) : (
              <input className="field w-44" type={e.kind === "date" ? "date" : "text"} value={fill} onChange={(ev) => setFill(ev.target.value)} onKeyDown={(ev) => ev.key === "Enter" && fillAll(fill.trim())} placeholder="Type, then Fill" />
            );
          })()}
          <button type="button" className="btn" disabled={pasting} onClick={() => fillAll(fill.trim())}>
            {pasting ? "Filling..." : "Fill"}
          </button>
          <span className="text-xs text-slate-500">or paste (Ctrl+V / Cmd+V)</span>
          <button type="button" className="btn-quiet ml-auto" onClick={() => (setSel(null), setFill(""))}>
            Cancel
          </button>
        </div>
      )}
      <div className={"card overflow-auto print-full " + (maxHeight ? "list-box" : "")}>
        <table className="text-sm">
          <thead>
            <tr>
              {cols.map((c, i) => (
                <th
                  key={i}
                  title={c.title}
                  className={"sticky top-0 z-10 whitespace-nowrap bg-brand-600 px-2 py-2 text-xs font-semibold text-white " + (c.noSort ? "" : "cursor-pointer select-none hover:bg-brand-700")}
                  onClick={() => !c.noSort && setSort((s) => (s && s.i === i ? (s.dir === 1 ? { i, dir: -1 } : null) : { i, dir: 1 }))}
                >
                  {picks && rows[0]?.cells[i]?.pick !== undefined ? (
                    <input
                      type="checkbox"
                      aria-label="Tick all"
                      title="Tick all / untick all"
                      className="edit-only mr-1 h-4 w-4 cursor-pointer align-middle accent-white"
                      onClick={(e) => e.stopPropagation()}
                      checked={shown.length > 0 && shown.every((r) => picked.includes(r.cells[i].pick!))}
                      onChange={(e) => {
                        const these = shown.map((r) => r.cells[i].pick!).filter(Boolean);
                        setPicked((p) => (e.target.checked ? [...new Set([...p, ...these])] : p.filter((x) => !these.includes(x))));
                      }}
                    />
                  ) : null}
                  {c.label}
                  {sort?.i === i ? (sort.dir === 1 ? " ▲" : " ▼") : ""}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.length === 0 && (
              <tr>
                <td className="px-4 py-6 text-slate-500" colSpan={cols.length}>
                  {empty}
                </td>
              </tr>
            )}
            {shown.map((r, ri) => (
              <tr key={r.key} className={"even:bg-stripe " + (r.cls ?? "")}>
                {r.cells.map((c, i) => (
                  <td
                    key={i}
                    data-r={c.edit && c.edit.kind !== "buttons" ? ri : undefined}
                    data-c={c.edit && c.edit.kind !== "buttons" ? i : undefined}
                    title={c.title}
                    className={"tc " + (c.edit ? "editable " : "") + (c.cls ?? "") + (sel && sel.c === i && ri >= sel.r1 && ri <= sel.r2 ? " cell-sel" : "") + (pasting ? " opacity-60" : "")}
                    onFocusCapture={c.edit && c.edit.kind !== "buttons" ? () => (extendTo.current = null, setAnchor({ r: ri, c: i }), setSel((s) => (s && s.c === i && ri >= s.r1 && ri <= s.r2 && s.r2 > s.r1 ? s : { c: i, r1: ri, r2: ri }))) : undefined}
                    onMouseDownCapture={
                      c.edit && c.edit.kind !== "buttons"
                        ? (ev) => {
                            // Shift-click: pick every cell from the anchor down (or up) to here, same column - no editing.
                            if (ev.shiftKey && anchor && anchor.c === i) {
                              ev.preventDefault();
                              ev.stopPropagation();
                              setSel({ c: i, r1: Math.min(anchor.r, ri), r2: Math.max(anchor.r, ri) });
                              return;
                            }
                            // Start of a drag down (or up) the column, like a sheet.
                            if (ev.button === 0) drag.current = { c: i, r0: ri };
                          }
                        : undefined
                    }
                    onMouseEnter={
                      c.edit && c.edit.kind !== "buttons"
                        ? (ev) => {
                            const d = drag.current;
                            if (!d || ev.buttons !== 1 || d.c !== i) return;
                            ev.preventDefault();
                            window.getSelection()?.removeAllRanges();
                            setAnchor({ r: d.r0, c: i });
                            setFill("");
                            setSel({ c: i, r1: Math.min(d.r0, ri), r2: Math.max(d.r0, ri) });
                          }
                        : undefined
                    }
                    onClickCapture={c.edit && c.edit.kind !== "buttons" ? (ev) => ev.shiftKey && (ev.preventDefault(), ev.stopPropagation()) : undefined}
                  >
                    {c.pick ? (
                      <input
                        type="checkbox"
                        aria-label="Tick"
                        className="edit-only h-4 w-4 cursor-pointer accent-red-600"
                        checked={picked.includes(c.pick)}
                        onChange={(e) => setPicked((p) => (e.target.checked ? [...p, c.pick!] : p.filter((x) => x !== c.pick)))}
                      />
                    ) : c.editRow && lists ? (
                      <EditRecord v={c.editRow} lists={lists} />
                    ) : c.del ? <DeleteButton id={c.del.id} what={c.del.what} off={c.del.off} /> : c.edit ? <EditCell e={c.edit} shown={c.t} /> : c.href ? <a className="font-bold text-black underline-offset-2 hover:underline" href={c.href}>{c.t}</a> : c.t}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
