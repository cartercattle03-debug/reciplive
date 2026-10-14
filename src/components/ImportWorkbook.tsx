"use client";
import { useState } from "react";
import { ask, post, toast } from "./ui";

/** The tabs the import reads. Everything else in the workbook (breakdowns, lookups, scratch tabs) is worked out live and isn't needed. */
const SHEETS = ["Data", "Lists", "Preg Check Archive", "Master Sheet", "75+ Day Cows"];

type Preview = { transfers: number; cows: number; batches: string[]; owners: number; companies: string[]; grades: string[]; archive: number; master: number; fixes: string[]; warnings: string[]; replacing: number };

/** Reads the .xlsx right here in the browser (cached values, the way the sheet was showing them) - date cells come over as "D:YYYY-MM-DD". */
async function readWorkbook(file: File) {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellNF: true, cellDates: false });
  const out: Record<string, (string | number | boolean | null)[][]> = {};
  for (const name of SHEETS) {
    const ws = wb.Sheets[name];
    if (!ws || !ws["!ref"]) continue;
    const r = XLSX.utils.decode_range(ws["!ref"]);
    const rows: (string | number | boolean | null)[][] = [];
    for (let R = r.s.r; R <= Math.min(r.e.r, 5000); R++) {
      const row: (string | number | boolean | null)[] = [];
      for (let C = 0; C <= Math.min(r.e.c, 60); C++) {
        const c = ws[XLSX.utils.encode_cell({ r: R, c: C })];
        let v: string | number | boolean | null = null;
        if (c) {
          if (c.t === "n" && c.z && XLSX.SSF.is_date(c.z)) {
            const d = XLSX.SSF.parse_date_code(c.v as number);
            v = d ? `D:${d.y}-${String(d.m).padStart(2, "0")}-${String(d.d).padStart(2, "0")}` : null;
          } else if (c.t === "s" || c.t === "n" || c.t === "b") v = c.v as string | number | boolean;
        }
        row.push(v);
      }
      while (row.length && (row[row.length - 1] === null || row[row.length - 1] === "")) row.pop();
      rows.push(row);
    }
    while (rows.length && !rows[rows.length - 1].length) rows.pop();
    out[name] = rows;
  }
  return out;
}

export function ImportWorkbook() {
  const [wb, setWb] = useState<Record<string, unknown> | null>(null);
  const [name, setName] = useState("");
  const [p, setP] = useState<Preview | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);
  return (
    <div className="card max-w-3xl p-5">
      <h2 className="mb-1 text-base font-semibold">Bring in a Savannah recip workbook</h2>
      <p className="mb-4 text-sm text-slate-600">
        In Google Sheets: File → Download → Microsoft Excel (.xlsx), then pick that file here. RecipLive reads the Data, Lists, Preg Check Archive, Master Sheet and 75+ Day Cows tabs. You&apos;ll see a preview before anything is saved.
      </p>
      <input
        type="file"
        accept=".xlsx,.xlsm,.xls"
        className="mb-4 block text-sm"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          setBusy(true);
          setP(null);
          setDone(null);
          try {
            const data = await readWorkbook(file);
            setWb(data);
            setName(file.name);
            setP(await post<Preview>("/api/import", { action: "preview", workbook: data }));
          } catch (x) {
            toast((x as Error).message, true);
          } finally {
            setBusy(false);
          }
        }}
      />
      {busy && !p && <p className="text-sm text-slate-500">Reading the workbook...</p>}
      {p && (
        <div className="text-sm">
          <h3 className="mb-2 font-semibold text-brand-700">What will come in from {name}</h3>
          <ul className="mb-3 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-3">
            <li><b>{p.transfers}</b> transfer records</li>
            <li><b>{p.cows}</b> cows</li>
            <li><b>{p.archive}</b> preg check archive lines</li>
            <li><b>{p.master}</b> Master Sheet lines</li>
            <li><b>{p.owners}</b> owners</li>
            <li>Groups: {p.batches.join(", ")}</li>
            <li>Companies: {p.companies.join(", ")}</li>
            <li className="col-span-2">Grades: {p.grades.join(", ")}</li>
          </ul>
          {p.fixes.length > 0 && (
            <div className="mb-3 rounded-md border border-emerald-200 bg-emerald-50 p-3">
              <div className="mb-1 font-semibold text-emerald-800">Cleaned up on the way in</div>
              <ul className="list-disc pl-5 text-emerald-900">{p.fixes.map((f) => <li key={f}>{f}</li>)}</ul>
            </div>
          )}
          {p.warnings.length > 0 && (
            <div className="mb-3 rounded-md border border-amber-200 bg-amber-50 p-3">
              <div className="mb-1 font-semibold text-amber-800">Worth a look</div>
              <ul className="list-disc pl-5 text-amber-900">{p.warnings.slice(0, 30).map((f) => <li key={f}>{f}</li>)}</ul>
              {p.warnings.length > 30 && <p className="mt-1 text-amber-800">...and {p.warnings.length - 30} more.</p>}
            </div>
          )}
          {p.replacing > 0 && <p className="mb-3 font-medium text-red-700">This replaces the {p.replacing} records on RecipLive now. A copy is kept first - Account → Undo brings them back.</p>}
          <button
            className="btn-go"
            disabled={busy}
            onClick={async () => {
              if (p.replacing && !(await ask(`Replace the ${p.replacing} records on RecipLive with this workbook?\n\nA copy of what's here now is kept - Account > Undo brings it back.`, "Replace and load"))) return;
              setBusy(true);
              try {
                const r = await post("/api/import", { action: "load", workbook: wb });
                setDone(`Loaded ${r.transfers} transfers, ${r.archive} archive lines and ${r.cows} Master Sheet lines.`);
                setP(null);
              } catch (x) {
                toast((x as Error).message, true);
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Loading..." : "Load it"}
          </button>
        </div>
      )}
      {done && (
        <div className="rounded-md border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-900">
          {done}{" "}
          <a href="/dashboard" className="font-semibold underline">
            Go to the Dashboard
          </a>
        </div>
      )}
    </div>
  );
}
