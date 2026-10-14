"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ask, post, toast } from "./ui";

type Batch = { id: string; label: string; transferDate: string | null; uses: number };
type Item = { id: string; value: string; uses: number };

function useAct() {
  const router = useRouter();
  return async (body: Record<string, unknown>, done?: string) => {
    try {
      await post("/api/lists", body);
      if (done) toast(done);
      router.refresh();
      return true;
    } catch (e) {
      toast((e as Error).message, true);
      return false;
    }
  };
}

export function BatchList({ batches }: { batches: Batch[] }) {
  const act = useAct();
  const [label, setLabel] = useState("");
  const [date, setDate] = useState("");
  return (
    <div className="card overflow-hidden">
      <div className="bg-brand-600 px-3 py-2 text-sm font-semibold text-white">Groups (batches)</div>
      <p className="px-3 pt-2 text-xs text-slate-500">In time order - the order decides which record is a cow&apos;s latest. The label stays text (8-15 never turns into a date).</p>
      <table className="keep-width m-2 text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="px-2">Order</th>
            <th className="px-2">Group</th>
            <th className="px-2">Transfer Date</th>
            <th className="px-2">Records</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {batches.map((b, i) => (
            <tr key={b.id} className={i % 2 ? "bg-stripe" : ""}>
              <td className="tc">
                {i + 1}
                <button className="edit-only ml-1 px-1 text-slate-500 hover:text-brand-700 disabled:opacity-20" disabled={i === 0} onClick={() => act({ action: "moveBatch", id: b.id, dir: -1 })} title="Move earlier">▲</button>
                <button className="edit-only px-1 text-slate-500 hover:text-brand-700 disabled:opacity-20" disabled={i === batches.length - 1} onClick={() => act({ action: "moveBatch", id: b.id, dir: 1 })} title="Move later">▼</button>
              </td>
              <td className="tc editable">
                <input className="cell-select w-20" defaultValue={b.label} onBlur={(e) => e.target.value.trim() !== b.label && act({ action: "updateBatch", id: b.id, label: e.target.value }, "Renamed on every record.")} />
              </td>
              <td className="tc editable">
                <input type="date" className="cell-select" defaultValue={b.transferDate ?? ""} onChange={(e) => e.target.value && act({ action: "updateBatch", id: b.id, transferDate: e.target.value }, "Transfer date saved.")} />
              </td>
              <td className="tc">{b.uses}</td>
              <td className="tc">
                {b.uses === 0 && (
                  <button className="edit-only text-xs text-red-700 hover:underline" onClick={async () => (await ask(`Take group ${b.label} off the list?`, "Remove")) && act({ action: "deleteBatch", id: b.id })}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="edit-only flex flex-wrap items-end gap-2 border-t border-slate-100 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "addBatch", label, transferDate: date }, `Group ${label} added - you can enter cows against it now.`)) {
            setLabel("");
            setDate("");
          }
        }}
      >
        <label className="text-xs font-medium text-slate-600">
          New group label
          <input className="field mt-0.5 w-28" placeholder="8-15" value={label} onChange={(e) => setLabel(e.target.value)} />
        </label>
        <label className="text-xs font-medium text-slate-600">
          Transfer date
          <input type="date" className="field mt-0.5 w-40" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <button className="btn">Add New Batch</button>
      </form>
    </div>
  );
}

export function ItemList({ kind, title, items }: { kind: string; title: string; items: Item[] }) {
  const act = useAct();
  const [v, setV] = useState("");
  return (
    <div className="card overflow-hidden">
      <div className="bg-brand-600 px-3 py-2 text-sm font-semibold text-white">{title}</div>
      <table className="keep-width m-2 text-sm">
        <tbody>
          {items.map((it, i) => (
            <tr key={it.id} className={i % 2 ? "bg-stripe" : ""}>
              <td className="tc editable">
                <input className="cell-select w-32" defaultValue={it.value} onBlur={(e) => e.target.value.trim() !== it.value && act({ action: "renameItem", id: it.id, value: e.target.value }, "Renamed on every record.")} />
              </td>
              <td className="tc text-xs text-slate-500">{it.uses} records</td>
              <td className="tc">
                {it.uses === 0 && (
                  <button className="edit-only text-xs text-red-700 hover:underline" onClick={async () => (await ask(`Take ${it.value} off the list?`, "Remove")) && act({ action: "deleteItem", id: it.id })}>
                    Remove
                  </button>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <form
        className="edit-only flex items-end gap-2 border-t border-slate-100 p-3"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await act({ action: "addItem", kind, value: v })) setV("");
        }}
      >
        <input className="field w-40" placeholder={`New ${title.toLowerCase().replace(/s$/, "")}`} value={v} onChange={(e) => setV(e.target.value)} />
        <button className="btn">Add</button>
      </form>
    </div>
  );
}
