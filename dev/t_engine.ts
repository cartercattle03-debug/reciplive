// Checks the engine against the numbers the real workbook was showing (its cached values).
// Run: node dev/run-test.js t_engine  (WB=/path/to/wb.json from dev/wb2json.py)
import * as fs from "fs";
import { parseWorkbook } from "../src/lib/workbook";
import * as R from "../src/lib/recip";

const wb = JSON.parse(fs.readFileSync(process.env.WB || "/tmp/claude-0/sav/wb.json", "utf8"));
const p = parseWorkbook(wb);
let fails = 0;
const eq = (name: string, got: unknown, want: unknown) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) fails++;
  console.log((ok ? "ok   " : "FAIL ") + name + (ok ? "" : `  got ${JSON.stringify(got)} want ${JSON.stringify(want)}`));
};
console.log("fixes:", p.fixes);
console.log("warnings:", p.warnings.slice(0, 20), p.warnings.length);
console.log("batches:", p.batches, "owners", p.owners.length, "companies", p.companies, "grades", p.grades);

const order = new Map(p.batches.map((b) => [b.label, b]));
const today = process.env.TODAY || "2026-10-14";
const rows: R.Transfer[] = p.transfers.map((t, i) => ({ ...t, id: String(i), batchOrder: order.get(t.batch)?.order ?? 0, transferDate: order.get(t.batch)?.transferDate ?? null }));
const calcNew = R.calculate(rows, p.archive, today);
// The sheet counted by status, so a culled cow fell out of the rate. Check parity with the sheet the sheet's way
// (outcome = status), then check the culled-cow rule (Carter, 2026-10-14) on its own below.
const calc = calcNew.map((c) => ({ ...c, outcome: c.status }));

// Row by row against the Data tab's own helper columns (same row order).
const D = wb["Data"];
const H: string[] = D[0];
const col = (n: string) => H.indexOf(n);
const dataRows = D.slice(1).filter((r: any[]) => r[1] !== null && r[1] !== undefined && r[1] !== "");
eq("row count", calc.length, dataRows.length);
const mism: Record<string, string[]> = {};
const check = (name: string, i: number, got: unknown, want: unknown) => {
  if (String(got ?? "") !== String(want ?? "")) (mism[name] ||= []).push(`${calc[i].cowId}@${calc[i].batch}: ${got} vs ${want}`);
};
dataRows.forEach((r: any[], i: number) => {
  const c = calc[i];
  check("Total Attempts", i, c.totalAttempts, r[col("Total Attempts")]);
  check("Repeat Flag", i, c.repeatFlag, r[col("Repeat Flag")]);
  check("Latest Record", i, c.latest ? "Yes" : "", r[col("Latest Record")]);
  check("Attempt #", i, c.attemptNo, r[col("Attempt # for This Cow")]);
  check("Times Probable", i, c.timesProbable, r[col("Times Probable")]);
  check("Times Passed", i, c.timesPassed, r[col("Times Passed")]);
  check("Fresh", i, c.freshReceived, r[col("Fresh Transfers Received")]);
  check("Frozen", i, c.frozenReceived, r[col("Frozen Transfers Received")]);
  const dco = r[col("Date Checked Open")];
  // 054 / 0038: the sheet couldn't match their archive lines (saved as 54 / 38); the import does - expected to differ.
  if (!["054", "0038"].includes(c.cowId)) check("Date Checked Open", i, c.dateCheckedOpen ?? "", typeof dco === "string" && dco.startsWith("D:") ? dco.slice(2) : dco ?? "");
});
for (const [k, v] of Object.entries(mism)) {
  fails++;
  console.log(`FAIL ${k}: ${v.length} rows differ`, v.slice(0, 8));
}
if (!Object.keys(mism).length) console.log("ok    every helper column matches the Data tab row for row");

// Dashboard
const dash = R.dashboard(calc);
const Db = wb["Dashboard"];
eq("Total Transfers", dash.totalTransfers, Db[4][0]);
eq("Confirmed Safe 75+", dash.confirmedSafe, Db[6][0]);
eq("Probable", dash.probable, Db[8][0]);
eq("Currently Open", dash.currentlyOpen, Db[10][0]);
eq("3+ still open", dash.threePlusOpen, Db[12][0]);
eq("Pending", dash.pending, Db[14][1]);

// Repeat Transfers
const rep = R.repeats(calc);
const RT = wb["Repeat Transfers"];
eq("Never Settled", rep.neverSettled, RT[4][3]);
eq("Repeat", rep.repeat, RT[5][3]);
eq("Unique cows", rep.unique, RT[6][3]);
rep.byAttempt.forEach((a, k) => eq(`${a.label} total/safe/prob/open/pend`, [a.total, a.safe, a.probable, a.open, a.pending], RT[6 + k].slice(6, 11)));
rep.settled.forEach((s, k) => eq(s.label, s.count, RT[10 + k][3]));
const rlist = (RT.slice(16) as any[][]).filter((r) => r[0]).map((r) => String(r[0])).sort();
// The sheet's list stops showing cows partway (157 qualify); every cow it does show must be on ours.
eq("Repeat list count = sheet's Repeat List? column", rep.list.length, dataRows.filter((r: any[]) => r[col("Repeat List?")] === 1).length);
eq("Repeat list shown on sheet all present", rlist.filter((id) => !rep.list.some((c) => c.cowId === id)), []);

// By Group
const bg = R.breakdown(calc, "batch", p.batches.map((b) => b.label));
const BG = wb["By Group"];
bg.rows.forEach((g, k) => eq(`By Group ${g.value}`, [g.total, g.pass, g.safe, g.probable, g.pending, g.open], BG[4 + k].slice(1, 7)));
// By Owner / Company / Embryo / Grade
for (const [tab, by, list] of [["By Owner", "owner", p.owners], ["By Company", "company", p.companies], ["By Embryo Type", "embryoType", ["Fresh", "Frozen"]], ["By Grade", "grade", p.grades]] as const) {
  const T = wb[tab];
  const b = R.breakdown(calc, by, list as string[]);
  const sheet = new Map<string, any[]>();
  for (const r of T.slice(4, 30)) {
    if (r && r[0] === "TOTAL") break;
    if (r && r[0]) sheet.set(String(r[0]), r);
  }
  let diffs: string[] = [];
  for (const g of b.rows) {
    const s = sheet.get(g.value);
    if (!s) continue;
    const want = s.slice(1, 6).map((x: any) => x ?? 0);
    const got = [g.total, g.safe, g.probable, g.pending, g.open];
    if (JSON.stringify(got) !== JSON.stringify(want)) diffs.push(`${g.value}: ${got} vs ${want}`);
  }
  eq(`${tab} counts`, diffs, []);
}

// Lists that the sheet shows
const oi = R.openInventory(calc, "Cow ID").map((c) => c.cowId).sort();
const OI = (wb["Open Inventory"].slice(4) as any[][]).filter((r) => r[0]).map((r) => String(r[0])).sort();
eq("Open Inventory cows", oi, OI);
const pc = R.pregCheckList(calc, {}).map((c) => c.cowId).sort();
const PC = (wb["Preg Check"].slice(9) as any[][]).filter((r) => r[1]).map((r) => String(r[1])).sort();
eq("Preg Check list (no filter)", pc, PC);
const d75 = R.day75(calc, p.owners).map((c) => c.cowId).sort();
const D75 = (wb["75+ Day Cows"].slice(7) as any[][]).filter((r) => r[1]).map((r) => String(r[1])).sort();
eq("75+ Day cows", d75, D75);
const ms = R.masterSheet(calc);
const MS = (wb["Master Sheet"].slice(4) as any[][]).filter((r) => r[0]).map((r) => [String(r[0]), r[4] ?? ""]);
// The sheet's Master Sheet has lost lines (sorted / deleted rows): every cow it shows must be on ours, and ours has every cow.
eq("Master Sheet: sheet cows all present", MS.filter((m) => !ms.some((x) => x.cowId === m[0])).map((m) => m[0]), []);
eq("Master Sheet: one line per cow", ms.length, rep.unique);
console.log("      cows missing from the sheet's Master Sheet:", ms.length - MS.length);
const fdMap = new Map(ms.map((m) => [m.cowId, m.finalDestination]));
eq("Final Destination", MS.filter((m) => String(fdMap.get(m[0]) ?? "") !== String(m[1])).slice(0, 10), []);
// Customer Search as it was saved (Lehman, sort by Mating)
const cs = R.customerSearch(calc, { owner: "Lehman", batches: [], statuses: [], sort: "Mating" });
const CS = (wb["Customer Search"].slice(24) as any[][]).filter((r) => r[0]).map((r) => String(r[0]));
eq("Customer Search Lehman rows", cs.rows.map((c) => c.cowId).sort(), [...CS].sort());
console.log("delivered on records:", rows.filter((r) => r.deliveryStatus === "Delivered").length, "with date:", rows.filter((r) => r.deliveryDate).length);
console.log("master lines:", p.cows.length, "archive:", p.archive.length);
// ---- Culled cows count against the Open number (unless confirmed Safe first, or a Pass)
const culled = calcNew.filter((c) => c.status === "Culled");
const k = R.countsOf(calcNew);
const sheetWay = R.countsOf(calc);
const culledSafe = culled.filter((c) => c.outcome === "Safe").length;
eq("every culled record is Open (or Pass / Delivered)", culled.every((c) => c.outcome === "Open" || (c.outcome === "Pass") || (c.outcome === "Safe" && c.deliveryStatus === "Delivered")), true);
eq("6019 (Safe, then culled) counts Open", calcNew.find((c) => c.cowId === "6019" && c.batch === "4-30")?.outcome, "Open");
eq("Open = Open + culled (not Safe)", k.open, sheetWay.open + culled.length - culledSafe - culled.filter((c) => c.outcome === "Pass").length);
eq("Safe = Safe + culled after Safe", k.safe, sheetWay.safe + culledSafe);
eq("transfers counted the same", k.total, sheetWay.total);
console.log(`      rate the sheet's way ${R.showRate(sheetWay.rate)} -> with culled cows counted ${R.showRate(k.rate)} (${culled.length} culled, ${culledSafe} of them Safe first)`);
console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
process.exit(fails ? 1 : 0);
