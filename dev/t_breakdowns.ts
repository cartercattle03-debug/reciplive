// Every breakdown number, checked against an independent count straight from the raw records (not the engine).
// Run: WB=/tmp/wb.json tsx dev/t_breakdowns.ts
import * as fs from "fs";
import { parseWorkbook } from "../src/lib/workbook";
import * as R from "../src/lib/recip";

const p = parseWorkbook(JSON.parse(fs.readFileSync(process.env.WB || "/tmp/claude-0/sav/wb.json", "utf8")));
const ord = new Map(p.batches.map((b) => [b.label, b]));
const rows: R.Transfer[] = p.transfers.map((t, i) => ({ ...t, id: String(i), batchOrder: ord.get(t.batch)?.order ?? 0, transferDate: ord.get(t.batch)?.transferDate ?? null }));
const calc = R.calculate(rows, p.archive, "2026-10-14");

// ---- The independent count: Carter's rule written out plainly, row by row.
// Culled = Open (failed pregnancy), unless it was a Pass (none in the workbook carry that) or already Delivered (Safe).
const result = (t: R.Transfer) => (t.status === "Culled" ? (t.deliveryStatus === "Delivered" ? "Safe" : "Open") : t.status);
type K = { total: number; pass: number; safe: number; probable: number; pending: number; open: number; culled: number; rate: number | null };
function count(list: R.Transfer[]): K {
  const k: K = { total: 0, pass: 0, safe: 0, probable: 0, pending: 0, open: 0, culled: 0, rate: null };
  for (const t of list) {
    k.total++;
    if (t.status === "Culled") k.culled++;
    const r = result(t);
    if (r === "Pass") k.pass++;
    else if (r === "Safe") k.safe++;
    else if (r === "Probable") k.probable++;
    else if (r === "Pending") k.pending++;
    else if (r === "Open") k.open++;
  }
  const checked = k.safe + k.probable + k.open;
  k.rate = checked ? (k.safe + k.probable) / checked : null;
  return k;
}
const lc = (s: string) => s.trim().toLowerCase();
let checks = 0;
let fails = 0;
const cmp = (where: string, got: R.Counts | { rate: number | null; hits: number; known: number; total: number; probable: number }, want: K) => {
  checks++;
  const g: any = got;
  const bad: string[] = [];
  if (g.total !== want.total) bad.push(`total ${g.total}/${want.total}`);
  if ("safe" in g) for (const f of ["pass", "safe", "probable", "pending", "open", "culled"] as const) if (g[f] !== want[f]) bad.push(`${f} ${g[f]}/${want[f]}`);
  if ("hits" in g) {
    if (g.hits !== want.safe + want.probable) bad.push(`hits ${g.hits}/${want.safe + want.probable}`);
    if (g.known !== want.safe + want.probable + want.open) bad.push(`checked ${g.known}/${want.safe + want.probable + want.open}`);
    if (g.probable !== want.probable) bad.push(`probable ${g.probable}/${want.probable}`);
  }
  if ((g.rate ?? -1).toFixed(6) !== (want.rate ?? -1).toFixed(6)) bad.push(`rate ${R.showRate(g.rate)} vs ${R.showRate(want.rate)}`);
  if (bad.length) {
    fails++;
    console.log(`FAIL ${where}: ${bad.join(", ")}`);
  }
};

const years = [...new Set(rows.map((t) => R.yearOf(t)).filter(Boolean))] as number[];
const lists = { batch: p.batches.map((b) => b.label), owner: p.owners, company: p.companies, grade: p.grades, embryoType: ["Fresh", "Frozen"] } as const;
const BYS = ["batch", "owner", "company", "embryoType", "grade"] as const;

for (const y of [...years, 0]) {
  const cy = y ? R.inYear(calc, y) : calc;
  const ry = y ? rows.filter((t) => R.yearOf(t) === y) : rows;
  const tag = y ? String(y) : "all years";
  // Summary tables: every line and the Total line.
  for (const by of BYS) {
    const vals = [...lists[by]];
    const b = R.breakdown(cy, by, vals);
    b.rows.forEach((r) => cmp(`${tag} By ${by} "${r.value}"`, r, count(ry.filter((t) => lc(t[by]) === lc(r.value)))));
    cmp(`${tag} By ${by} TOTAL`, b.total, count(ry.filter((t) => vals.some((v) => lc(v) === lc(t[by])))));
  }
  // Every grid cell the page shows, each embryo type and all types.
  const grids: [(typeof BYS)[number], (typeof BYS)[number]][] = [["owner", "company"], ["company", "batch"], ["grade", "company"], ["batch", "company"]];
  for (const [rb, cb] of grids)
    for (const type of ["Fresh", "Frozen", undefined]) {
      const m = R.matrix(cy, rb, [...lists[rb]], cb, [...lists[cb]], type);
      m.forEach((row) =>
        row.cells.forEach((cell, i) => {
          const cv = lists[cb][i];
          cmp(`${tag} ${rb} x ${cb} ${type ?? "all"} [${row.value} / ${cv}]`, cell, count(ry.filter((t) => lc(t[rb]) === lc(row.value) && lc(t[cb]) === lc(cv) && (!type || t.embryoType === type))));
        })
      );
    }
  // Customer Search / each customer's portal.
  for (const o of p.owners) {
    const cs = R.customerSearch(cy, { owner: o, batches: [], statuses: [], sort: "Cow ID" });
    const k = count(ry.filter((t) => lc(t.owner) === lc(o)));
    checks++;
    if (cs.totalTransferred !== k.total || cs.confirmed75 !== k.safe || (cs.rate ?? -1).toFixed(6) !== (k.rate ?? -1).toFixed(6)) {
      fails++;
      console.log(`FAIL ${tag} customer ${o}: ${cs.totalTransferred}/${k.total} ${cs.confirmed75}/${k.safe} ${R.showRate(cs.rate)} vs ${R.showRate(k.rate)}`);
    }
  }
}
// Success rate by attempt number (Repeat Transfers).
const rep = R.repeats(calc);
rep.byAttempt.forEach((a, i) => {
  const n = i + 1;
  const k = count(calc.filter((c) => (n === 4 ? c.attemptNo >= 4 : c.attemptNo === n)));
  checks++;
  if (a.total !== k.total || a.safe !== k.safe || a.open !== k.open || a.probable !== k.probable || (a.rate ?? -1).toFixed(6) !== (k.rate ?? -1).toFixed(6)) {
    fails++;
    console.log(`FAIL ${a.label}: ${JSON.stringify(a)} vs ${JSON.stringify(k)}`);
  }
});
// Spot checks by hand (Carter's examples).
const lane = R.breakdown(calc, "owner", ["Lane"]).rows[0];
checks++;
if (lane.safe + lane.probable !== 1 || lane.safe + lane.probable + lane.open !== 3 || R.showRate(lane.rate) !== "33.3%") (fails++, console.log("FAIL Lane", lane));
const weldon = R.customerSearch(calc, { owner: "Weldon", batches: [], statuses: [], sort: "Cow ID" });
checks++;
if (R.showRate(weldon.rate) !== "44.7%" || weldon.confirmed75 !== 20) (fails++, console.log("FAIL Weldon", weldon.confirmed75, R.showRate(weldon.rate)));
console.log(`${checks} numbers checked across every summary line, total, grid cell, customer and attempt #.`);
const all = R.countsOf(calc);
console.log(`Whole herd: ${all.safe + all.probable}/${all.safe + all.probable + all.open} = ${R.showRate(all.rate)} (Safe ${all.safe}, Probable ${all.probable}, Open ${all.open - all.culledOpen}, Culled ${all.culledOpen}, Pending ${all.pending}, Pass ${all.pass})`);
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
