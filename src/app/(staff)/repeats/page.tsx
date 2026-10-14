import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { batchCell, cowCell, numCell } from "@/lib/cells";
import { repeats, showRate } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function Repeats() {
  const m = await staffPage();
  const { calc } = await loadRanch(m.organizationId);
  const r = repeats(calc);
  const pctOf = (n: number) => (r.unique ? ((n / r.unique) * 100).toFixed(1) + "%" : "-");
  const rows: Row[] = r.list.map((c) => ({
    key: c.id,
    cells: [cowCell(c.cowId), batchCell(c), { t: c.status, cls: c.status ? `st-${c.status}` : "" }, numCell(c.totalAttempts), numCell(c.safeCount), numCell(c.openCount), { t: c.repeatFlag, cls: c.repeatFlag === "NEVER SETTLED" ? "text-red-700 font-semibold" : "" }, numCell(c.timesPassed), numCell(c.timesProbable)],
  }));
  const th = "whitespace-nowrap bg-brand-600 px-3 py-2 text-xs font-semibold text-white";
  return (
    <div>
      <PageHeader title="Repeat Transfer Cows" sub="Every cow with 2+ records, read from her most recent one." />
      <div className="mb-5 flex flex-wrap items-start gap-5">
        <div className="card overflow-hidden">
          <table className="text-sm">
            <thead>
              <tr>
                <th className={th}>Metric</th>
                <th className={th}>Count</th>
                <th className={th}>% of Herd</th>
              </tr>
            </thead>
            <tbody>
              <tr><td className="tc !text-left">Cows Never Settled (2+ opens, 0 Safe)</td><td className="tc">{r.neverSettled}</td><td className="tc">{pctOf(r.neverSettled)}</td></tr>
              <tr className="bg-stripe"><td className="tc !text-left">Cows Repeat-Transferred</td><td className="tc">{r.repeat}</td><td className="tc">{pctOf(r.repeat)}</td></tr>
              <tr><td className="tc !text-left">Total Unique Cows</td><td className="tc">{r.unique}</td><td className="tc"></td></tr>
              {r.settled.map((s, i) => (
                <tr key={s.label} className={i % 2 ? "" : "bg-stripe"}><td className="tc !text-left">{s.label}</td><td className="tc">{s.count}</td><td className="tc"></td></tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="card overflow-hidden">
          <div className="bg-tan px-3 py-1.5 text-xs font-semibold text-brand-700">Success Rate by Attempt Number - is it still worth trying again?</div>
          <table className="text-sm">
            <thead>
              <tr>
                {["Attempt #", "Total Attempts", "Safe", "Probable", "Open", "Pending", "Success Rate (this attempt)"].map((h) => (
                  <th key={h} className={th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {r.byAttempt.map((a, i) => (
                <tr key={a.label} className={i % 2 ? "bg-stripe" : ""}>
                  <td className="tc font-semibold">{a.label}</td>
                  <td className="tc">{a.total}</td>
                  <td className="tc">{a.safe}</td>
                  <td className="tc">{a.probable}</td>
                  <td className="tc">{a.open}</td>
                  <td className="tc">{a.pending}</td>
                  <td className="tc font-semibold">{showRate(a.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="px-3 py-2 text-xs text-slate-500">Each line is the outcome of that try (1st transfer, 2nd ...), not her lifetime result.</p>
        </div>
      </div>
      <Table search cols={[{ label: "Cow ID" }, { label: "Current Group" }, { label: "Current Status" }, { label: "Total Attempts" }, { label: "Lifetime Safe" }, { label: "Lifetime Open" }, { label: "Repeat Flag" }, { label: "Lifetime Pass" }, { label: "Lifetime Probable" }]} rows={rows} />
    </div>
  );
}
