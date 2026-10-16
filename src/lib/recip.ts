/**
 * RecipLive - the recip program's numbers, worked out live from the transfer list.
 *
 * Everything the Savannah 2.0 workbook kept in its 30-plus helper columns on the Data tab
 * (Total Attempts, Repeat Flag, Latest Record, Attempt #, Times Probable, Embryo Age, the
 * Open Inventory / Preg Check / 75+ Day ranks ...) is worked out here, every time a page opens,
 * so it can never go stale or point at the wrong row. No database code in this file.
 *
 * Dates are plain "YYYY-MM-DD" strings so the ranch's calendar day never shifts with a time zone.
 */

export const STATUSES = ["Pending", "Probable", "Safe", "Open", "Pass", "Culled", "Not Recorded"] as const;
/** What a preg check can come back as. */
export const PREG_RESULTS = ["Probable", "Safe", "Open"] as const;
/** The results a cow can get at the chute: one already checked Probable can only come back Safe or Open (Carter, 2026-10-14).
 *  A Probable typed for her before this rule still shows, so it can be tapped back off. */
export function resultsFor(status: string, draft?: string | null): string[] {
  if (status !== "Probable") return [...PREG_RESULTS];
  return draft === "Probable" ? [...PREG_RESULTS] : ["Safe", "Open"];
}
/**
 * The status a record shows as on every list and report (Carter, 2026-10-14): a culled cow reads as what her transfer came
 * to - Open, mostly - so a customer never sees "Culled" against their cows. She is still stored as Culled, and the Master
 * Archive (and Master Sheet Final Destination) keep the cull with its date.
 */
export const shownStatus = (c: { status: string; outcome?: string }) => (c.status === "Culled" ? c.outcome || "Open" : c.status);
export const EMBRYO_TYPES = ["Fresh", "Frozen"] as const;
export const DELIVERY = ["Delivered", "Undelivered"] as const;
/** Due Date = transfer date + 276 days (the workbook's rule). */
export const DUE_DAYS = 276;
/** Embryo age = days since transfer + 7 (a 7-day embryo at transfer). */
export const EMBRYO_AGE_AT_TRANSFER = 7;

export type Transfer = {
  id: string;
  /** Order the row was entered - breaks ties inside one batch, like row order did on the sheet. */
  seq: number;
  batch: string;
  /** The batch's place in time (Lists > Group Order). 0 = no batch. */
  batchOrder: number;
  /** The batch's transfer date, YYYY-MM-DD. */
  transferDate: string | null;
  cowId: string;
  mating: string;
  owner: string;
  embryoType: string;
  grade: string;
  company: string;
  status: string;
  deliveryStatus: string;
  deliveryDate: string | null;
  notes: string;
  /** A preg check result typed on the Preg Check page, not yet confirmed. */
  pregDraft?: string | null;
  pregDraftDate?: string | null;
  /** A Due Date typed in by hand; Days Bred is worked back from it. */
  dueOverride?: string | null;
};

export type ArchiveRow = { checkDate: string; batch: string; cowId: string; mating: string; owner: string; result: string };

export type Calc = Transfer & {
  /** What the transfer came to for the pregnancy-rate math: the status, except a Culled record keeps its result (see outcomeOf). */
  outcome: string;
  /** Her preg checks on this record, oldest first (matched by group + Cow ID - see matchChecks). */
  checks: ArchiveRow[];
  /** The day she was last checked Safe on this record. */
  safeCheckDate: string | null;
  totalAttempts: number;
  safeCount: number;
  openCount: number;
  pendingCount: number;
  repeatFlag: "NEVER SETTLED" | "Repeat" | "Single";
  /** Her most recent record (highest batch, then last entered). Current status reads from this row only. */
  latest: boolean;
  attemptNo: number;
  dueDate: string | null;
  embryoAge: number | null;
  freshReceived: number;
  frozenReceived: number;
  timesProbable: number;
  timesPassed: number;
  everProbable: boolean;
  /**
   * Pregnant at her first preg check, for Lost after Probable: checked Probable - or ever Safe, since a cow had to be
   * Probable to be checked Safe (Carter, 2026-10-15: fills in groups whose first check came before the sheet's
   * archive started on 7/15/2026). Delivered counts too; a cull while Probable or Safe counts.
   */
  wasProbable: boolean;
  /** Latest preg check date she was called Open (on a row whose status is Open). */
  dateCheckedOpen: string | null;
};

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

export function addDays(ymd: string, days: number): string {
  const [y, m, d] = ymd.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}
export function daysBetween(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86400000);
}
/** Today on the ranch (Central time), YYYY-MM-DD. */
export function ranchToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
export function showDate(ymd: string | null | undefined): string {
  if (!ymd) return "";
  return `${+ymd.slice(5, 7)}/${+ymd.slice(8, 10)}/${ymd.slice(0, 4)}`;
}
/** (Safe + Probable) / (Safe + Open + Probable), counted by outcome - a culled cow is in Open. Pending and Pass never count. */
export function pregRate(safe: number, probable: number, open: number): number | null {
  const d = safe + probable + open;
  return d === 0 ? null : (safe + probable) / d;
}
export function showRate(r: number | null): string {
  return r === null ? "-" : (r * 100).toFixed(1) + "%";
}

/**
 * Cow ID "family" order, as the workbook sorted them: all-number IDs by first digit, then length,
 * then value (so 102, 159, 1085, 1314, 2028 ...). IDs with letters or a dash (F14, 968H, 348-1) come first, in natural order.
 */
export function familyKey(id: string): [number, number, number, number, string] {
  const s = String(id ?? "").trim();
  if (/^\d+$/.test(s)) return [1, +s[0], s.length, Number(s), s];
  return [0, 0, 0, 0, s.toLowerCase()];
}
export function compareFamily(a: string, b: string): number {
  const x = familyKey(a);
  const y = familyKey(b);
  for (let i = 0; i < 4; i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number);
  return x[4].localeCompare(y[4], undefined, { numeric: true });
}

const norm = (s: string | null | undefined) => String(s ?? "").trim();
const same = (a: string, b: string) => norm(a).toLowerCase() === norm(b).toLowerCase();

// ---------------------------------------------------------------------------
// The Data tab's helper columns
// ---------------------------------------------------------------------------

/** A cull, as far as the math needs it: which record, and what it was before ("was Open"). */
export type CullNote = { transferId: string | null; detail: string };

/**
 * What a record's transfer actually came to, for the pregnancy-rate math (Carter, 2026-10-14):
 * culling a cow doesn't erase the result - a cow called Open and then culled still counts against the Open number.
 * A culled record counts as Open - a failed pregnancy, even one that was checked Safe first (Carter, 2026-10-14: cow 6019).
 * Only two exceptions: a culled Pass stays a Pass (no transfer, never counts), and a cow already marked Delivered
 * keeps her Safe (the calf came).
 */
function outcomeOf(r: Transfer, _lastResult: Map<string, string>, culls: CullNote[]): string {
  if (r.status !== "Culled") return r.status;
  if (r.deliveryStatus === "Delivered") return "Safe";
  const was = culls.find((c) => c.transferId === r.id)?.detail.match(/^was (\w[\w ]*)$/)?.[1];
  if (was === "Pass") return "Pass";
  return "Open";
}

/** A mating as written loosely: "Sure Fire x 91/Z", "Sure Fire x 91Z" and "sure fire x 91 z" are one mating. */
const looseMating = (m: string) => norm(m).toLowerCase().replace(/[\s/.\-]/g, "");

/**
 * Which record each preg check belongs to (Carter, 2026-10-14). By group + Cow ID - the mating on a chute sheet isn't
 * always typed the same as on the transfer ("TB x 70/E" for "Turner Burner x 70/E"), and the old sheet lost three Safes
 * that way. Only when a cow has two records in one group does the mating decide (loosely), else her last one entered.
 */
export function matchChecks(rows: Transfer[], archive: ArchiveRow[]): Map<string, ArchiveRow[]> {
  const byGroupCow = new Map<string, Transfer[]>();
  for (const r of rows) {
    const k = `${norm(r.batch).toLowerCase()}|${norm(r.cowId).toLowerCase()}`;
    if (!byGroupCow.has(k)) byGroupCow.set(k, []);
    byGroupCow.get(k)!.push(r);
  }
  const out = new Map<string, ArchiveRow[]>();
  for (const a of [...archive].sort((x, y) => x.checkDate.localeCompare(y.checkDate))) {
    const cands = byGroupCow.get(`${norm(a.batch).toLowerCase()}|${norm(a.cowId).toLowerCase()}`);
    if (!cands?.length) continue;
    const r = cands.length === 1 ? cands[0] : cands.find((c) => looseMating(c.mating) === looseMating(a.mating)) ?? [...cands].sort((x, y) => x.seq - y.seq)[cands.length - 1];
    if (!out.has(r.id)) out.set(r.id, []);
    out.get(r.id)!.push(a);
  }
  return out;
}

export function calculate(rows: Transfer[], archive: ArchiveRow[], today: string, culls: CullNote[] = []): Calc[] {
  const byCow = new Map<string, Transfer[]>();
  for (const r of rows) {
    const k = norm(r.cowId);
    if (!k) continue;
    if (!byCow.has(k)) byCow.set(k, []);
    byCow.get(k)!.push(r);
  }
  // Archive lookups: each record's own preg checks; when was she last checked Open.
  const checksOf = matchChecks(rows, archive);
  const lastResult = new Map<string, string>();
  const lastOpen = new Map<string, string>();
  for (const a of archive) {
    const cow = norm(a.cowId);
    if (a.result === "Open" && a.checkDate) {
      const was = lastOpen.get(cow);
      if (!was || a.checkDate > was) lastOpen.set(cow, a.checkDate);
    }
  }
  // A record with no group (added on Preg Check by Cow ID only - Carter, 2026-10-16) is her newest.
  const order = (r: Transfer) => [r.batch ? r.batchOrder || 0 : Number.MAX_SAFE_INTEGER, r.seq] as const;
  // Probable at some check on this record - or culled while she was Probable (the cull notes what she was).
  const everProbable = (r: Transfer) =>
    r.status === "Probable" || (checksOf.get(r.id) ?? []).some((a) => a.result === "Probable") || (r.status === "Culled" && culls.some((c) => c.transferId === r.id && /^was Probable$/.test(c.detail)));

  const out: Calc[] = [];
  for (const r of rows) {
    const cow = norm(r.cowId);
    const mine = cow ? byCow.get(cow)! : [];
    const count = (st: string) => mine.filter((x) => x.status === st).length;
    const sorted = [...mine].sort((a, b) => order(a)[0] - order(b)[0] || order(a)[1] - order(b)[1]);
    const last = sorted[sorted.length - 1];
    const safeCount = count("Safe");
    const openCount = count("Open");
    const total = mine.length;
    const repeatFlag: Calc["repeatFlag"] = safeCount === 0 && openCount >= 2 ? "NEVER SETTLED" : total > 1 ? "Repeat" : "Single";
    const latest = !!cow && last === r;
    out.push({
      ...r,
      totalAttempts: total,
      safeCount,
      openCount,
      pendingCount: count("Pending"),
      repeatFlag,
      latest,
      attemptNo: cow ? sorted.indexOf(r) + 1 : 0,
      dueDate: r.dueOverride ? r.dueOverride : r.transferDate && r.status !== "Pass" ? addDays(r.transferDate, DUE_DAYS) : null,
      embryoAge: r.dueOverride
        ? daysBetween(addDays(r.dueOverride, -DUE_DAYS), today) + EMBRYO_AGE_AT_TRANSFER
        : r.transferDate && r.status !== "Pass"
          ? daysBetween(r.transferDate, today) + EMBRYO_AGE_AT_TRANSFER
          : null,
      freshReceived: mine.filter((x) => x.embryoType === "Fresh").length,
      frozenReceived: mine.filter((x) => x.embryoType === "Frozen").length,
      timesProbable: mine.filter(everProbable).length,
      timesPassed: count("Pass"),
      everProbable: everProbable(r),
      wasProbable:
        everProbable(r) ||
        r.status === "Safe" ||
        r.deliveryStatus === "Delivered" ||
        (checksOf.get(r.id) ?? []).some((a) => a.result === "Safe") ||
        (r.status === "Culled" && culls.some((c) => c.transferId === r.id && /^was (Safe|Probable)$/.test(c.detail))),
      outcome: outcomeOf(r, lastResult, culls),
      checks: checksOf.get(r.id) ?? [],
      safeCheckDate: [...(checksOf.get(r.id) ?? [])].reverse().find((a) => a.result === "Safe")?.checkDate || null,
      dateCheckedOpen: r.status === "Open" ? lastOpen.get(cow) ?? null : null,
    });
  }
  return out;
}

/** One row per cow: her most recent record, carrying her lifetime totals. */
export const latestRows = (calc: Calc[]) => calc.filter((c) => c.latest);

export type Counts = {
  total: number; pass: number; safe: number; probable: number; pending: number; open: number; culled: number; /** Culled records counted in Open. */ culledOpen: number; unchecked: number; rate: number | null;
  /** Checked Probable, then Safe at 75 days - the pregnancy held. */ held: number;
  /** Checked Probable, then Open - lost before 75 days. A culled Probable is a loss too (Carter, 2026-10-15). */ lost: number;
  /** Lost / (Held + Lost): of the Probables that have come to their 75-day answer, the share lost. */ lossRate: number | null;
  /** Every record checked Probable (held, lost, or still waiting) - "1 lost of 10 Probables" (Carter, 2026-10-15). */ probables: number;
};
export function countsOf(rows: Calc[]): Counts {
  // Counted by what each transfer came to - a culled cow still counts under her result (an Open, mostly).
  const n = (s: string) => rows.filter((r) => r.outcome === s).length;
  const safe = n("Safe");
  const probable = n("Probable");
  const pending = n("Pending");
  const open = n("Open");
  const held = rows.filter((r) => r.wasProbable && r.outcome === "Safe").length;
  const lost = rows.filter((r) => r.wasProbable && r.outcome === "Open").length;
  return { total: rows.length, pass: n("Pass"), safe, probable, pending, open, culled: rows.filter((r) => r.status === "Culled").length, culledOpen: rows.filter((r) => r.status === "Culled" && r.outcome === "Open").length, unchecked: probable + pending, rate: pregRate(safe, probable, open), held, lost, lossRate: held + lost ? lost / (held + lost) : null, probables: rows.filter((r) => r.wasProbable && r.outcome !== "Pass").length };
}

// ---------------------------------------------------------------------------
// Pages
// ---------------------------------------------------------------------------

export function dashboard(calc: Calc[]) {
  const cows = calc.filter((c) => norm(c.cowId));
  const latest = latestRows(cows);
  return {
    totalTransfers: cows.filter((c) => c.outcome !== "Pass").length,
    confirmedSafe: latest.filter((c) => c.status === "Safe").length,
    probable: cows.filter((c) => c.status === "Probable").length,
    currentlyOpen: latest.filter((c) => c.status === "Open").length,
    threePlusOpen: latest.filter((c) => c.status === "Open" && c.totalAttempts >= 3).length,
    pending: cows.filter((c) => c.status === "Pending").length,
    notRecorded: cows.filter((c) => c.status === "Not Recorded").length,
    uniqueCows: latest.length,
  };
}

export type BreakdownBy = "batch" | "owner" | "company" | "embryoType" | "grade";
export const BREAKDOWN_LABELS: Record<BreakdownBy, string> = { batch: "Group", owner: "Owner", company: "Company", embryoType: "Embryo Type", grade: "Grade" };

/** By Group / By Owner / ... : one line per list value (in the Lists order), then a Total line. */
export function breakdown(calc: Calc[], by: BreakdownBy, values: string[]) {
  const rows = values.map((v) => ({ value: v, ...countsOf(calc.filter((c) => same(c[by], v))) }));
  const all = calc.filter((c) => values.some((v) => same(c[by], v)));
  return { rows, total: countsOf(all) };
}

/**
 * The detail grids (Owner x Company, Company x Group, Grade x Company), one embryo type or all.
 * Each cell: rate, Safe+Probable / Safe+Open+Probable, how many transfers, and whether any are still Probable.
 */
export function matrix(calc: Calc[], rowBy: BreakdownBy, rowValues: string[], colBy: BreakdownBy, colValues: string[], embryoType?: string) {
  const base = embryoType ? calc.filter((c) => c.embryoType === embryoType) : calc;
  const cell = (rows: Calc[]) => {
    const k = countsOf(rows);
    return { rate: k.rate, hits: k.safe + k.probable, known: k.safe + k.open + k.probable, total: k.total, probable: k.probable, lost: k.lost, probables: k.probables, held: k.held };
  };
  return rowValues.map((rv) => {
    const mine = base.filter((c) => same(c[rowBy], rv));
    return {
      value: rv,
      cells: colValues.map((cv) => cell(mine.filter((c) => same(c[colBy], cv)))),
      /** The whole row across every column (Carter, 2026-10-15: a company's loss over all its groups). */
      total: cell(mine.filter((c) => colValues.some((cv) => same(c[colBy], cv)))),
    };
  });
}

export type PregFilter = { batch?: string | null; minAge?: number | null; maxAge?: number | null };

/** Preg Check list: her latest record, not yet Safe/Open (blank, Pending or Probable), inside the Group or embryo-age window. */
export function pregCheckList(calc: Calc[], f: PregFilter): Calc[] {
  return latestRows(calc)
    .filter((c) => !c.status || c.status === "Pending" || c.status === "Probable")
    // A cow added with no group has no group or age to filter on - she always shows until she's checked.
    .filter((c) => !c.batch || !f.batch || same(c.batch, f.batch))
    .filter((c) => !c.batch || f.minAge == null || (c.embryoAge !== null && c.embryoAge >= f.minAge))
    .filter((c) => !c.batch || f.maxAge == null || (c.embryoAge !== null && c.embryoAge <= f.maxAge))
    .sort((a, b) => compareFamily(a.cowId, b.cowId));
}

/** 75+ Day Cows: her latest record is Safe. In Group, then Owner (Lists order), then Cow ID order. */
export function day75(calc: Calc[], ownerOrder: string[]): Calc[] {
  const oi = (o: string) => {
    const i = ownerOrder.findIndex((x) => same(x, o));
    return i < 0 ? 9999 : i;
  };
  return latestRows(calc)
    .filter((c) => c.status === "Safe")
    .sort((a, b) => a.batchOrder - b.batchOrder || oi(a.owner) - oi(b.owner) || compareFamily(a.cowId, b.cowId));
}

export const OPEN_SORTS = ["Cow ID", "Repeat Flag", "Total Attempts", "Times Passed", "Date Checked Open"] as const;
export type OpenSort = (typeof OPEN_SORTS)[number];

/** Open Inventory: her latest record is Open or Pass - ready to start her next attempt. */
export function openInventory(calc: Calc[], sort: OpenSort = "Date Checked Open"): Calc[] {
  const flagRank = (f: string) => (f === "NEVER SETTLED" ? 1 : f === "Repeat" ? 2 : 3);
  const cmp: Record<OpenSort, (a: Calc, b: Calc) => number> = {
    "Cow ID": () => 0,
    "Repeat Flag": (a, b) => flagRank(a.repeatFlag) - flagRank(b.repeatFlag),
    "Total Attempts": (a, b) => b.totalAttempts - a.totalAttempts,
    "Times Passed": (a, b) => b.timesPassed - a.timesPassed,
    // No date yet first, then the longest-open cows.
    "Date Checked Open": (a, b) => (a.dateCheckedOpen ?? "").localeCompare(b.dateCheckedOpen ?? ""),
  };
  return latestRows(calc)
    .filter((c) => c.status === "Open" || c.status === "Pass")
    .sort((a, b) => cmp[sort](a, b) || compareFamily(a.cowId, b.cowId));
}
/** A cull candidate on Open Inventory: passed over at the chute twice or more. */
export const cullFlag = (c: Calc) => c.timesPassed >= 2;

/** Cow Lookup: every record she has, in order. */
export function cowHistory(calc: Calc[], cowId: string): Calc[] {
  return calc.filter((c) => same(c.cowId, cowId)).sort((a, b) => a.attemptNo - b.attemptNo);
}

/** Repeat Transfers tab. */
export function repeats(calc: Calc[]) {
  const latest = latestRows(calc);
  const unique = latest.length;
  const neverSettled = latest.filter((c) => c.repeatFlag === "NEVER SETTLED").length;
  const repeat = latest.filter((c) => c.repeatFlag === "Repeat").length;
  const byAttempt = [1, 2, 3, 4].map((n) => {
    const rows = calc.filter((c) => (n === 4 ? c.attemptNo >= 4 : c.attemptNo === n));
    const k = countsOf(rows);
    return { label: n === 1 ? "1st Attempt" : n === 2 ? "2nd Attempt" : n === 3 ? "3rd Attempt" : "4th+ Attempt", total: k.total, safe: k.safe, probable: k.probable, open: k.open, pending: k.pending, rate: k.rate };
  });
  const settled = [1, 2, 3, 4].map((n) => ({
    label: n === 4 ? "Settled After 4+ Tries" : `Settled After ${n} ${n === 1 ? "Try" : "Tries"}`,
    count: latest.filter((c) => c.status === "Safe" && (n === 4 ? c.totalAttempts >= 4 : c.totalAttempts === n)).length,
  }));
  const list = latest.filter((c) => c.repeatFlag === "NEVER SETTLED" || c.repeatFlag === "Repeat").sort((a, b) => compareFamily(a.cowId, b.cowId));
  return { unique, neverSettled, repeat, byAttempt, settled, list };
}

export const CUSTOMER_SORTS = ["Transfer Date", "Mating", "Cow ID"] as const;
export type CustomerFilter = { owner: string; batches: string[]; statuses: string[]; sort: (typeof CUSTOMER_SORTS)[number] };

/** Customer Search: one owner's transfers, narrowed by any batches / statuses ticked (none ticked = all). */
export function customerSearch(calc: Calc[], f: CustomerFilter) {
  const rows = calc
    .filter((c) => norm(c.cowId) && same(c.owner, f.owner))
    .filter((c) => !f.batches.length || f.batches.some((b) => same(b, c.batch)))
    .filter((c) => !f.statuses.length || f.statuses.includes(shownStatus(c)))
    .sort((a, b) => {
      const byMating = norm(a.mating).localeCompare(norm(b.mating), undefined, { numeric: true });
      // Transfer Date (the customer's page, Carter 2026-10-16): oldest transfer first, then Mating, then Cow ID.
      if (f.sort === "Transfer Date") return (a.batch ? a.batchOrder : 1e9) - (b.batch ? b.batchOrder : 1e9) || byMating || compareFamily(a.cowId, b.cowId) || a.seq - b.seq;
      return f.sort === "Mating" ? byMating || a.seq - b.seq : compareFamily(a.cowId, b.cowId) || a.seq - b.seq;
    });
  const safe = rows.filter((c) => c.outcome === "Safe").length;
  const probable = rows.filter((c) => c.outcome === "Probable").length;
  const open = rows.filter((c) => c.outcome === "Open").length;
  return {
    rows,
    totalTransferred: rows.length,
    confirmed75: safe,
    currentlyProbable: rows.filter((c) => c.status === "Probable" && c.latest).length,
    rate: pregRate(safe, probable, open),
  };
}

export type CowExtra = {
  cowId: string;
  purchaseDate: string;
  loanLocation: string;
  cost: number | null;
  salePrice: number | null;
  soldDate: string;
  transactionNo: string;
  addedOpen?: boolean;
  addedYear?: number | null;
  offListRecord?: string | null;
  openYear?: number | null;
  openYearRecord?: string | null;
};

/** The year a record belongs to: its batch's transfer date. */
export const yearOf = (c: { transferDate: string | null }) => (c.transferDate ? Number(c.transferDate.slice(0, 4)) : null);
/** Only the records whose batch was transferred in that year. */
export const inYear = <T extends { transferDate: string | null }>(rows: T[], year: number) => rows.filter((r) => yearOf(r) === year);

/** Master Sheet: one line per cow in family order. Final Destination: Culled if any record says so, else the owner of her Safe latest record. */
export function masterSheet(calc: Calc[]) {
  const latest = latestRows(calc).sort((a, b) => compareFamily(a.cowId, b.cowId));
  return latest.map((c) => {
    const mine = calc.filter((x) => same(x.cowId, c.cowId));
    const culled = mine.some((x) => x.status === "Culled");
    return { cowId: c.cowId, finalDestination: culled ? "Culled" : c.status === "Safe" ? c.owner : "" };
  });
}
