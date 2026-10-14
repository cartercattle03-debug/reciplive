/**
 * Reads a Savannah 2.0 recip workbook (already turned into rows of cells in the browser) into
 * RecipLive's records, fixing what Google Sheets did to the data along the way:
 *  - grades and batch names Sheets turned into dates ("7-1" -> July 1) go back to "7-1";
 *  - a company typed as a number (605) and as text ("605") is one company;
 *  - Cow IDs stay text, so leading zeros hold (054 is not 54). An archive line saved as the
 *    number 54 is matched to "054" only when exactly one cow fits.
 *  - Master Sheet and 75+ Day entries typed beside a self-sorting Cow ID list are read with the
 *    Cow ID that was showing on the same line, so each lands on the right cow.
 * Nothing here touches the database.
 */
import { calculate, type ArchiveRow, type CowExtra, type Transfer } from "./recip";
import { statusCatchups } from "./reconcile";

export type Cell = string | number | boolean | null;
export type Workbook = Record<string, Cell[][]>;

export type ParsedWorkbook = {
  batches: { label: string; transferDate: string | null; order: number }[];
  owners: string[];
  companies: string[];
  grades: string[];
  transfers: Omit<Transfer, "id" | "batchOrder" | "transferDate">[];
  archive: ArchiveRow[];
  cows: CowExtra[];
  /** What was cleaned up, in plain words, for the import preview. */
  fixes: string[];
  warnings: string[];
  /** Records put forward to their last preg check on the way in (index into transfers, what Data said, what it is now). */
  catchups: { index: number; cowId: string; batch: string; was: string; now: string }[];
};

const DATE_RE = /^D:\d{4}-\d{2}-\d{2}$/;
const isDate = (v: Cell): v is string => typeof v === "string" && DATE_RE.test(v);
const ymd = (v: Cell): string | null => {
  if (typeof v !== "string") return null;
  if (DATE_RE.test(v)) return v.slice(2);
  return /^\d{4}-\d{2}-\d{2}/.test(v) ? v.slice(0, 10) : null;
};
/** "D:2026-07-01" -> "7-1" (a grade or batch Sheets turned into a date). */
const dateToMonthDay = (v: string) => `${+v.slice(7, 9)}-${+v.slice(10, 12)}`;

/** A cell as text. Whole numbers lose the ".0"; dates read M/D/YYYY. */
export function text(v: Cell): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isInteger(v) ? String(v) : String(v);
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (DATE_RE.test(v)) return `${+v.slice(7, 9)}/${+v.slice(10, 12)}/${v.slice(2, 6)}`;
  return v.replace(/\s+/g, " ").trim();
}
const num = (v: Cell): number | null => {
  if (typeof v === "number") return v;
  const s = text(v).replace(/[$,\s]/g, "");
  return s && !isNaN(Number(s)) ? Number(s) : null;
};

/** Finds the heading row (the first row holding every `need` heading) and a heading -> column map. */
function headed(rows: Cell[][] | undefined, need: string[]): { at: number; col: (name: string) => number } | null {
  if (!rows) return null;
  const want = need.map((n) => n.toLowerCase());
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const hs = (rows[i] ?? []).map((c) => text(c).toLowerCase());
    if (want.every((w) => hs.includes(w))) return { at: i, col: (name) => hs.indexOf(name.toLowerCase()) };
  }
  return null;
}
const at = (row: Cell[] | undefined, i: number): Cell => (i < 0 || !row ? null : row[i] ?? null);

export function parseWorkbook(wb: Workbook): ParsedWorkbook {
  const fixes: string[] = [];
  const catchups: ParsedWorkbook["catchups"] = [];
  const warnings: string[] = [];
  let gradeFixed = 0;
  let batchFixed = 0;
  let companyNum = 0;

  // ---------------- Lists
  const lists = headed(wb["Lists"], ["Owner", "Company", "Grade"]);
  const listRows = lists ? (wb["Lists"] ?? []).slice(lists.at + 1) : [];
  const colOf = (names: string[]) => {
    if (!lists) return -1;
    for (const n of names) {
      const c = lists.col(n);
      if (c >= 0) return c;
    }
    return -1;
  };
  const cGroup = colOf(["Group (transfer date)", "Group", "Batch"]);
  const cOrder = colOf(["Group Order (chronological #)", "Group Order", "Order"]);
  const cDate = colOf(["Transfer Date"]);
  const grade = (v: Cell) => {
    if (isDate(v)) {
      gradeFixed++;
      return dateToMonthDay(v);
    }
    return text(v);
  };
  const company = (v: Cell) => {
    if (typeof v === "number") companyNum++;
    return text(v);
  };
  const uniq = (xs: string[]) => {
    const seen = new Set<string>();
    return xs.filter((x) => {
      const k = x.toLowerCase();
      if (!x || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  };
  const owners = uniq(listRows.map((r) => text(at(r, colOf(["Owner"])))));
  const companies = uniq(listRows.map((r) => company(at(r, colOf(["Company"])))));
  const grades = uniq(listRows.map((r) => grade(at(r, colOf(["Grade"])))));
  const batches: ParsedWorkbook["batches"] = [];
  for (const r of listRows) {
    let label = at(r, cGroup);
    if (label === null || label === "") continue;
    if (isDate(label)) {
      batchFixed++;
      label = dateToMonthDay(label);
    }
    const l = text(label);
    if (batches.some((b) => b.label.toLowerCase() === l.toLowerCase())) continue;
    batches.push({ label: l, transferDate: ymd(at(r, cDate)), order: num(at(r, cOrder)) ?? batches.length + 1 });
  }

  // ---------------- Data (the transfer list)
  const data = headed(wb["Data"], ["Cow ID", "Status"]);
  if (!data) throw new Error('Could not find the Data tab (with "Cow ID" and "Status" headings).');
  const D = wb["Data"]!;
  const c = (n: string) => data.col(n);
  const dGroup = c("Group") >= 0 ? c("Group") : c("Batch");
  const transfers: ParsedWorkbook["transfers"] = [];
  const dataDates = new Map<string, Map<string, number>>();
  for (let i = data.at + 1; i < D.length; i++) {
    const r = D[i];
    const cowId = text(at(r, c("Cow ID")));
    if (!cowId) continue;
    let b = at(r, dGroup);
    if (isDate(b)) {
      batchFixed++;
      b = dateToMonthDay(b);
    }
    const batch = text(b);
    const td = ymd(at(r, c("Transfer Date")));
    if (batch && td) {
      if (!dataDates.has(batch)) dataDates.set(batch, new Map());
      const m = dataDates.get(batch)!;
      m.set(td, (m.get(td) ?? 0) + 1);
    }
    transfers.push({
      seq: transfers.length + 1,
      batch,
      cowId,
      mating: text(at(r, c("Mating"))),
      owner: text(at(r, c("Owner"))),
      embryoType: text(at(r, c("Embryo Type"))),
      grade: grade(at(r, c("Grade"))),
      company: company(at(r, c("Company"))),
      status: text(at(r, c("Status"))),
      deliveryStatus: text(at(r, c("Delivery Status"))),
      deliveryDate: null,
      notes: text(at(r, c("Notes"))),
    });
  }

  // Batches used on Data but missing from Lists go on the end; a batch with no date on Lists takes the date its rows show.
  for (const t of transfers) {
    if (t.batch && !batches.some((b) => b.label.toLowerCase() === t.batch.toLowerCase())) {
      batches.push({ label: t.batch, transferDate: null, order: Math.max(0, ...batches.map((b) => b.order)) + 1 });
      warnings.push(`Group "${t.batch}" was on Data but not on Lists - added at the end.`);
    }
  }
  for (const b of batches) {
    if (b.transferDate) continue;
    const m = dataDates.get(b.label);
    if (m && m.size) {
      b.transferDate = [...m.entries()].sort((x, y) => y[1] - x[1])[0][0];
      fixes.push(`Group ${b.label} had no Transfer Date on Lists - took ${b.transferDate} from its rows on Data.`);
    }
  }
  // Owners / companies / grades typed on Data but not on Lists join the lists.
  const topUp = (list: string[], vals: string[]) => {
    for (const v of vals) if (v && !list.some((x) => x.toLowerCase() === v.toLowerCase())) list.push(v);
  };
  topUp(owners, transfers.map((t) => t.owner));
  topUp(companies, transfers.map((t) => t.company));
  topUp(grades, transfers.map((t) => t.grade));
  // One spelling per owner / company / grade: Data rows take the list's spelling.
  const canon = (list: string[], v: string) => list.find((x) => x.toLowerCase() === v.toLowerCase()) ?? v;
  for (const t of transfers) {
    t.owner = canon(owners, t.owner);
    t.company = canon(companies, t.company);
    t.grade = canon(grades, t.grade);
  }

  // ---------------- Cow ID matching for the other tabs
  const cowIds = new Set(transfers.map((t) => t.cowId));
  let zeroFixed = 0;
  const resolveCow = (v: Cell): string => {
    const s = text(v);
    if (!s || cowIds.has(s)) return s;
    // "54" from a number cell: the one cow whose ID is 54 with leading zeros.
    if (/^\d+$/.test(s)) {
      const hits = [...cowIds].filter((id) => /^0+\d+$/.test(id) && id.replace(/^0+/, "") === s);
      if (hits.length === 1) {
        zeroFixed++;
        return hits[0];
      }
    }
    return s;
  };
  const batchByDate = (d: string) => batches.find((b) => b.transferDate === d)?.label;

  // ---------------- Preg Check Archive
  const archive: ArchiveRow[] = [];
  const pa = headed(wb["Preg Check Archive"], ["Cow ID", "Result"]);
  if (pa) {
    const P = wb["Preg Check Archive"]!;
    for (let i = pa.at + 1; i < P.length; i++) {
      const r = P[i];
      const cowId = resolveCow(at(r, pa.col("Cow ID")));
      const result = text(at(r, pa.col("Result")));
      if (!cowId || !result) continue;
      let b = at(r, pa.col("Batch"));
      let batch = text(b);
      if (isDate(b)) {
        batchFixed++;
        batch = batchByDate(b.slice(2)) ?? dateToMonthDay(b);
      }
      archive.push({
        checkDate: ymd(at(r, pa.col("Date"))) ?? "",
        batch,
        cowId,
        mating: text(at(r, pa.col("Mating"))),
        owner: canon(owners, text(at(r, pa.col("Owner")))),
        result,
      });
    }
  }

  // ---------------- Master Sheet (typed beside the Cow ID that was showing on that line)
  const cows: CowExtra[] = [];
  const ms = headed(wb["Master Sheet"], ["Cow ID", "Purchase Date"]);
  if (ms) {
    const M = wb["Master Sheet"]!;
    for (let i = ms.at + 1; i < M.length; i++) {
      const r = M[i];
      const cowId = resolveCow(at(r, ms.col("Cow ID")));
      const extra: CowExtra = {
        cowId,
        purchaseDate: text(at(r, ms.col("Purchase Date"))),
        loanLocation: text(at(r, ms.col("Loan Location"))),
        cost: num(at(r, ms.col("Cost"))),
        salePrice: num(at(r, ms.col("Sale Price"))),
        soldDate: text(at(r, ms.col("Sold Date"))),
        transactionNo: text(at(r, ms.col("Transaction #"))),
      };
      const typed = extra.purchaseDate || extra.loanLocation || extra.cost !== null || extra.salePrice !== null || extra.soldDate || extra.transactionNo;
      if (!typed) continue;
      if (!cowId) {
        warnings.push(`Master Sheet line ${i + 1} has entries but no Cow ID showing - left out.`);
        continue;
      }
      if (!cowIds.has(cowId)) warnings.push(`Master Sheet: cow ${cowId} has no transfers - her Master Sheet line is kept.`);
      cows.push(extra);
    }
  }

  // ---------------- 75+ Day Cows delivery (typed beside the Cow ID showing on that line) -> her latest Safe record
  const dd = headed(wb["75+ Day Cows"], ["Cow ID", "Delivery Status"]);
  let delivered = 0;
  if (dd) {
    const order = new Map(batches.map((b) => [b.label.toLowerCase(), b.order]));
    const calc = calculate(
      transfers.map((t, k) => ({ ...t, id: String(k), batchOrder: order.get(t.batch.toLowerCase()) ?? 0, transferDate: null })),
      [],
      "2000-01-01"
    );
    const R = wb["75+ Day Cows"]!;
    for (let i = dd.at + 1; i < R.length; i++) {
      const r = R[i];
      const cowId = resolveCow(at(r, dd.col("Cow ID")));
      const status = text(at(r, dd.col("Delivery Status")));
      const date = ymd(at(r, dd.col("Delivery Date")));
      if (!cowId || (!status && !date)) continue;
      const k = calc.findIndex((x) => x.cowId === cowId && x.latest && x.status === "Safe");
      if (k < 0) {
        warnings.push(`75+ Day Cows: cow ${cowId} is marked ${status || "with a delivery date"} but her latest record isn't Safe - left off.`);
        continue;
      }
      if (status) transfers[k].deliveryStatus = status;
      if (date) transfers[k].deliveryDate = date;
      delivered++;
    }
  }

  // Statuses that never caught up with their own preg check (mating typed differently on the chute sheet).
  {
    const order = new Map(batches.map((b) => [b.label.toLowerCase(), b]));
    const calc = calculate(
      transfers.map((t, k) => ({ ...t, id: String(k), batchOrder: order.get(t.batch.toLowerCase())?.order ?? 0, transferDate: order.get(t.batch.toLowerCase())?.transferDate ?? null })),
      archive,
      "2000-01-01"
    );
    const ups = statusCatchups(calc);
    for (const u of ups) {
      catchups.push({ index: Number(u.id), cowId: u.cowId, batch: u.batch, was: u.status, now: u.result });
      transfers[Number(u.id)].status = u.result;
    }
    if (ups.length)
      fixes.push(`${ups.length} record(s) whose status never caught up with their own preg check now read their last result: ${ups.map((u) => `${u.cowId} (${u.batch}) ${u.status || "blank"} -> ${u.result} on ${u.checkDate}`).join(", ")}.`);
  }
  if (gradeFixed) fixes.push(`${gradeFixed} grade(s) that Sheets had turned into dates were put back (July 1 -> 7-1).`);
  if (batchFixed) fixes.push(`${batchFixed} batch name(s) that Sheets had turned into dates were put back (4/30/2026 -> 4-30).`);
  if (companyNum) fixes.push(`${companyNum} company entries stored as a number (605) now match the text ones - one company.`);
  if (zeroFixed) fixes.push(`${zeroFixed} Cow ID(s) that lost their leading zero (54) were matched to their cow (054).`);
  if (delivered) fixes.push(`${delivered} delivery line(s) from 75+ Day Cows tied to the right cow's record.`);
  return { batches: batches.sort((a, b) => a.order - b.order), owners, companies, grades, transfers, archive, cows, fixes, warnings, catchups };
}
