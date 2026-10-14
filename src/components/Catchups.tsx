"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { ask, post, toast } from "./ui";
import type { Catchup } from "@/lib/reconcile";
import { showDate } from "@/lib/recip";

/** Records whose status never caught up with their own preg check: see them, untick any you don't want, fix them. */
export function Catchups({ list }: { list: Catchup[] }) {
  const router = useRouter();
  const [on, setOn] = useState<string[]>(list.map((c) => c.id));
  const [busy, setBusy] = useState(false);
  if (!list.length) return null;
  return (
    <div id="catchup" className="card mb-5 max-w-4xl border-amber-300 p-4">
      <h2 className="mb-1 text-base font-semibold text-amber-900">
        {list.length} record{list.length === 1 ? "" : "s"} didn&apos;t catch up with {list.length === 1 ? "its" : "their"} preg check
      </h2>
      <p className="mb-3 text-sm text-slate-600">
        These were checked at the chute but the result never landed on the record - on the old sheet the mating had to be typed exactly the same on the preg check sheet. Fixing one puts her last check result on her record (so a Safe cow moves to 75+ Day Cows and Billing, and off Open Inventory). Untick any that shouldn&apos;t change. Account → Undo can take it back.
      </p>
      <table className="keep-width mb-3 text-sm">
        <thead>
          <tr className="text-xs text-slate-500">
            <th className="px-2"></th>
            <th className="px-2">Cow ID</th>
            <th className="px-2">Owner</th>
            <th className="px-2">Group</th>
            <th className="px-2">Record says</th>
            <th className="px-2">Last check</th>
            <th className="px-2">Mating on record / on the check</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id}>
              <td className="tc">
                <input type="checkbox" className="edit-only h-4 w-4" checked={on.includes(c.id)} onChange={(e) => setOn((o) => (e.target.checked ? [...o, c.id] : o.filter((x) => x !== c.id)))} />
              </td>
              <td className="tc font-bold">{c.cowId}</td>
              <td className="tc">{c.owner}</td>
              <td className="tc grp">{c.batch}</td>
              <td className={"tc st-" + (c.status || "x")}>{c.status || "(blank)"}</td>
              <td className={"tc st-" + c.result}>
                {c.result} on {showDate(c.checkDate)}
              </td>
              <td className="tc text-xs">
                {c.mating} / {c.checkMating || "(blank)"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <button
        className="btn-go edit-only"
        disabled={busy || !on.length}
        onClick={async () => {
          if (!(await ask(`Put the last preg check result on ${on.length} record(s)?`, `Fix ${on.length}`))) return;
          setBusy(true);
          try {
            const r = await post("/api/repair", { action: "catchup", cowIds: on });
            toast(`${r.fixed} fixed.`);
            router.refresh();
          } catch (e) {
            toast((e as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      >
        Fix {on.length} ticked
      </button>
    </div>
  );
}
