"use client";
import { useEffect, useMemo, useState } from "react";
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
    return (
      <select
        className={"cell-select" + (busy ? " opacity-50" : "")}
        value={val}
        disabled={busy}
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
      <button type="button" className="ic" onClick={() => setEditing(true)} title="Click to edit">
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
}) {
  const router = useRouter();
  const [sort, setSort] = useState<{ i: number; dir: 1 | -1 } | null>(null);
  const [picked, setPicked] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [q, setQ] = useState("");
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
  return (
    <div>
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
                    if (!(await ask(p.ask.replace("{n}", String(picked.length)).replace("{names}", picked.join(", ")), `${p.label} (${picked.length})`))) return;
                    setBusy(true);
                    try {
                      await post(p.url, { action: p.action, cowIds: picked, ...(p.extra ?? {}) });
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
                  {p.label} ({picked.length})
                </button>
              ))}
            </span>
          )}
        </div>
      )}
      <div className={"card overflow-auto print-full " + (maxHeight ? "max-h-[calc(100vh-14rem)]" : "")}>
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
            {shown.map((r) => (
              <tr key={r.key} className={"even:bg-stripe " + (r.cls ?? "")}>
                {r.cells.map((c, i) => (
                  <td key={i} title={c.title} className={"tc " + (c.edit ? "editable " : "") + (c.cls ?? "")}>
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
