"use client";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { PASTE_FIELDS, matchHeading, splitPaste } from "@/lib/pasteMatch";
import { ask, post, toast } from "./ui";

/** Paste a block of transfers copied from a sheet (heading row first). Columns are matched by heading - pick another for any column. */
export function PasteTransfers() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const [override, setOverride] = useState<Record<number, string>>({});
  const [busy, setBusy] = useState(false);
  const grid = useMemo(() => splitPaste(text), [text]);
  const heads = grid[0] ?? [];
  const map = heads.map((h, i) => (override[i] !== undefined ? override[i] : matchHeading(h) ?? ""));
  const body = grid.slice(1);
  const rows = body.map((cells) => {
    const r: Record<string, string> = {};
    map.forEach((f, i) => {
      if (f && cells[i] !== undefined && cells[i] !== "") r[f] = cells[i];
    });
    return r;
  }).filter((r) => r.cowId);
  if (!open)
    return (
      <button className="btn-quiet edit-only" onClick={() => setOpen(true)}>
        Paste rows
      </button>
    );
  return (
    <div className="fixed inset-0 z-40 flex items-start justify-center overflow-auto bg-slate-900/50 p-4" onClick={() => setOpen(false)}>
      <div className="card mt-10 w-full max-w-3xl p-5" onClick={(e) => e.stopPropagation()}>
        <h2 className="mb-1 text-base font-semibold">Paste transfers</h2>
        <p className="mb-3 text-sm text-slate-600">Copy the rows from a sheet, heading row included, and paste below. Columns are matched by their heading - any order works. Rows go on the end of the list; nothing already here is changed.</p>
        <textarea className="field h-40 font-mono text-xs" value={text} onChange={(e) => { setText(e.target.value); setOverride({}); }} placeholder={"Group\tCow ID\tMating\tOwner\tEmbryo Type\tGrade\tCompany\tStatus"} />
        {heads.length > 0 && (
          <div className="mt-3 overflow-auto">
            <table className="text-xs">
              <thead>
                <tr>
                  <th className="px-2 py-1 text-left text-slate-500">Pasted heading</th>
                  {heads.map((h, i) => (
                    <th key={i} className="px-2 py-1 font-semibold">{h || "(blank)"}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-2 py-1 text-left text-slate-500">Goes to</td>
                  {heads.map((_, i) => (
                    <td key={i} className="px-1 py-1">
                      <select className="field w-auto py-0.5 text-xs" value={map[i]} onChange={(e) => setOverride({ ...override, [i]: e.target.value })}>
                        <option value="">Ignore</option>
                        {PASTE_FIELDS.map((f) => (
                          <option key={f.field} value={f.field}>{f.label}</option>
                        ))}
                      </select>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
            <p className="mt-2 text-sm">{rows.length} row{rows.length === 1 ? "" : "s"} with a Cow ID ready to add{body.length - rows.length ? ` (${body.length - rows.length} without a Cow ID left out)` : ""}.</p>
          </div>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button className="btn-quiet" onClick={() => setOpen(false)}>Cancel</button>
          <button
            className="btn-go"
            disabled={busy || !rows.length || !map.includes("cowId")}
            onClick={async () => {
              if (!(await ask(`Add ${rows.length} transfer${rows.length === 1 ? "" : "s"} to the end of the list?`, "Add them"))) return;
              setBusy(true);
              try {
                const r = await post("/api/transfers", { action: "add", rows });
                toast(`${r.added} added.`);
                setOpen(false);
                setText("");
                router.refresh();
              } catch (e) {
                toast((e as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Adding..." : `Add ${rows.length || ""}`}
          </button>
        </div>
      </div>
    </div>
  );
}
