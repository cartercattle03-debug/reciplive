import Link from "next/link";
import { PageHeader } from "@/components/Shell";
import { breakdown, dashboard, showRate } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function Dashboard() {
  const m = await staffPage();
  const { calc, lists } = await loadRanch(m.organizationId);
  const d = dashboard(calc);
  const g = breakdown(calc, "batch", lists.batches.map((b) => b.label));
  const cards: [string, number | string, string?][] = [
    ["Total Transfers", d.totalTransfers],
    ["Confirmed Safe (75+ Day)", d.confirmedSafe, "/day75"],
    ["Probable", d.probable, "/preg-check"],
    ["Currently Open", d.currentlyOpen, "/open"],
    ["3+ Transfers, Still Open", d.threePlusOpen, "/open?sort=Total+Attempts"],
    ["Pending Check", d.pending, "/preg-check"],
    ["Unique Cows", d.uniqueCows, "/master"],
  ];
  return (
    <div>
      <PageHeader title="Recip program dashboard" sub="Live - every number updates the moment a transfer or preg check result is saved." />
      {calc.length === 0 && (
        <div className="card mb-5 p-5 text-sm">
          Nothing loaded yet. <Link className="font-semibold text-brand-600 underline" href="/import">Import your Savannah workbook</Link> or start adding transfers on the <Link className="font-semibold text-brand-600 underline" href="/transfers">Transfers</Link> page.
        </div>
      )}
      <div className="mb-6 flex flex-wrap gap-3">
        {cards.map(([label, v, href]) =>
          href ? (
            <Link key={label} href={href} className="stat transition hover:border-brand-600">
              <b>{v}</b>
              <span>{label}</span>
            </Link>
          ) : (
            <div key={label} className="stat">
              <b>{v}</b>
              <span>{label}</span>
            </div>
          )
        )}
        {d.notRecorded > 0 && (
          <div className="stat">
            <b>{d.notRecorded}</b>
            <span>Not Recorded</span>
          </div>
        )}
      </div>
      <h2 className="mb-2 text-sm font-semibold text-slate-700">Pregnancy rate by group</h2>
      <div className="card overflow-auto">
        <table className="text-sm">
          <thead>
            <tr>
              {["Group", "Transfer Date", "Total Attempts", "Pass", "Safe", "Probable", "Pending", "Open", "Unchecked", "Pregnancy Rate"].map((h) => (
                <th key={h} className="whitespace-nowrap bg-brand-600 px-3 py-2 text-xs font-semibold text-white">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {g.rows.map((r, i) => (
              <tr key={r.value} className="even:bg-stripe">
                <td className="tc font-semibold">{r.value}</td>
                <td className="tc">{lists.batches[i]?.transferDate ? new Date(lists.batches[i].transferDate + "T12:00:00").toLocaleDateString("en-US") : ""}</td>
                {[r.total, r.pass, r.safe, r.probable, r.pending, r.open, r.unchecked].map((n, k) => (
                  <td key={k} className="tc">{n}</td>
                ))}
                <td className="tc font-semibold">{showRate(r.rate)}</td>
              </tr>
            ))}
            <tr className="border-t-2 border-brand-600 bg-tan font-semibold">
              <td className="tc">TOTAL</td>
              <td className="tc"></td>
              {[g.total.total, g.total.pass, g.total.safe, g.total.probable, g.total.pending, g.total.open, g.total.unchecked].map((n, k) => (
                <td key={k} className="tc">{n}</td>
              ))}
              <td className="tc">{showRate(g.total.rate)}</td>
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-xs text-slate-500">Pregnancy Rate = (Safe + Probable) ÷ (Safe + Open + Probable). Pending, Pass and Culled aren't known outcomes, so they never count.</p>
    </div>
  );
}
