import Link from "next/link";
import { PageHeader } from "@/components/Shell";
import { breakdown, dashboard, inYear, showRate } from "@/lib/recip";
import { openList } from "@/lib/openList";
import { pickedYear, thisYear } from "@/lib/server/year";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function Dashboard() {
  const m = await staffPage();
  const { calc: all, lists, cows } = await loadRanch(m.organizationId);
  const year = pickedYear();
  const calc = inYear(all, year);
  const yb = lists.batches.filter((b) => b.transferDate?.startsWith(String(year)));
  const d = dashboard(calc);
  const opens = openList(all, cows, year, thisYear());
  d.currentlyOpen = opens.length;
  d.threePlusOpen = opens.filter((o) => o.totalAttempts >= 3).length;
  const g = breakdown(calc, "batch", yb.map((b) => b.label));
  const cards: [string, number | string, string?][] = [
    ["Total Transfers", d.totalTransfers],
    ["Confirmed Safe (75+ Day)", d.confirmedSafe, "/day75"],
    ["Probable", d.probable, "/preg-check"],
    ["Currently Open", d.currentlyOpen, "/open"],
    ["3+ Transfers, Still Open", d.threePlusOpen, "/open?sort=Total+Attempts"],
    ["Pending Check", d.pending, "/preg-check"],
    ["Cows Transferred", d.uniqueCows, "/master"],
  ];
  return (
    <div>
      <PageHeader title={`Recip program dashboard - ${year}`} sub={`Transfers in ${year} batches, and the ${year} open list. Pick another year in the Year box at the top. Live - every number updates the moment a result is saved.`} />
      {all.length > 0 && calc.length === 0 && <div className="card mb-5 p-5 text-sm">No transfers in {year} yet - a fresh slate. Add the year&apos;s first batch on <Link className="font-semibold text-brand-600 underline" href="/lists">Lists</Link>, with its transfer date.</div>}
      {all.length === 0 && (
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
                <td className="tc">{yb[i]?.transferDate ? new Date(yb[i].transferDate + "T12:00:00").toLocaleDateString("en-US") : ""}</td>
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
