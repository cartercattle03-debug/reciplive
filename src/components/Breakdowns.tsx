import { BREAKDOWN_LABELS, breakdown, matrix, showRate, type BreakdownBy, type Calc } from "@/lib/recip";

const th = "whitespace-nowrap bg-brand-600 px-3 py-2 text-xs font-semibold text-white";

/** A breakdown line per value (By Group / Company / ...), then a Total line. Shared by the staff page and a customer's portal. */
export function Summary({ calc, by, vals }: { calc: Calc[]; by: BreakdownBy; vals: string[] }) {
  const b = breakdown(calc, by, vals);
  const pass = by === "batch";
  const heads = [BREAKDOWN_LABELS[by], pass ? "Total Attempts" : "Total Transfers", ...(pass ? ["Pass"] : []), "Safe", "Probable", "Pending", "Open", "Unchecked", "Pregnancy Rate"];
  const line = (k: (typeof b.rows)[number] | (typeof b)["total"], label: string, cls = "") => (
    <tr key={label} className={cls}>
      <td className="tc font-semibold">{label}</td>
      <td className="tc">{k.total}</td>
      {pass && <td className="tc">{k.pass}</td>}
      <td className="tc">{k.safe}</td>
      <td className="tc">{k.probable}</td>
      <td className="tc">{k.pending}</td>
      <td className="tc">{k.open}</td>
      <td className="tc">{k.unchecked}</td>
      <td className="tc font-semibold">{showRate(k.rate)}</td>
    </tr>
  );
  return (
    <div className="card mb-6 overflow-auto">
      <table className="text-sm">
        <thead>
          <tr>{heads.map((h) => <th key={h} className={th}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {b.rows.map((r, i) => line(r, r.value, i % 2 ? "bg-stripe" : ""))}
          {line(b.total, "TOTAL", "border-t-2 border-brand-600 bg-tan")}
        </tbody>
      </table>
    </div>
  );
}

export function Grid({ title, calc, rowBy, rows, colBy, cols, type }: { title: string; calc: Calc[]; rowBy: BreakdownBy; rows: string[]; colBy: BreakdownBy; cols: string[]; type?: string }) {
  const m = matrix(calc, rowBy, rows, colBy, cols, type);
  return (
    <div className="mb-6">
      <h3 className="mb-1.5 text-sm font-semibold text-brand-700">{title}</h3>
      <div className="card overflow-auto">
        <table className="text-sm">
          <thead>
            <tr>
              <th className={th}>{BREAKDOWN_LABELS[rowBy]}</th>
              {cols.map((c) => <th key={c} className={th}>{c}</th>)}
            </tr>
          </thead>
          <tbody>
            {m.map((r, i) => (
              <tr key={r.value} className={i % 2 ? "bg-stripe" : ""}>
                <td className="tc font-semibold">{r.value}</td>
                {r.cells.map((c, k) => (
                  <td key={k} className={"tc " + (c.probable ? "flag" : "")} title={c.total ? `${c.total} transfer${c.total === 1 ? "" : "s"}${c.probable ? `, ${c.probable} still Probable` : ""}` : ""}>
                    {c.total ? (
                      <>
                        <div className="font-semibold">{showRate(c.rate)}</div>
                        <div className="text-[11px] font-normal text-slate-500">{c.known ? `${c.hits}/${c.known}` : `${c.total} unchecked`}</div>
                      </>
                    ) : (
                      ""
                    )}
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

