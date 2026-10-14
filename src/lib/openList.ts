/**
 * Open Inventory by year (Carter, 2026-10-14).
 *  - A cow is open when her latest record is Open or Pass, or she was added straight to the list with no transfer yet.
 *  - Her year is the year she was checked Open (a Nov / Dec transfer checked in Jan / Feb falls to the new year),
 *    a Pass's batch year, or the year she was added. "Move to next year" moves her for that record only.
 *  - The red X takes her off the list for that record only; a new transfer that comes back Open puts her back on.
 */
import { compareFamily, cullFlag, latestRows, OPEN_SORTS, type Calc, type CowExtra, type OpenSort } from "./recip";

export type OpenEntry = {
  cowId: string;
  /** Her latest record; null for a cow added with no transfer yet. */
  rec: Calc | null;
  year: number;
  /** "Added" when she came straight onto the list. */
  added: boolean;
  totalAttempts: number;
  timesPassed: number;
  repeatFlag: string;
  dateCheckedOpen: string | null;
};

export function openEntries(calc: Calc[], cows: Map<string, CowExtra>, thisYear: number): OpenEntry[] {
  const out: OpenEntry[] = [];
  const withRecords = new Set<string>();
  for (const c of latestRows(calc)) {
    withRecords.add(c.cowId);
    const x = cows.get(c.cowId);
    if (x?.offListRecord === c.id) continue;
    // Brought back onto the open list after this record (a Safe recip back from calving, a cow re-bought).
    const addedBack = !!x?.addedOpen && x.openYearRecord === c.id && c.status !== "Open" && c.status !== "Pass";
    if (addedBack) {
      out.push({ cowId: c.cowId, rec: c, year: x!.openYear ?? x!.addedYear ?? thisYear, added: true, totalAttempts: c.totalAttempts, timesPassed: c.timesPassed, repeatFlag: c.repeatFlag, dateCheckedOpen: null });
      continue;
    }
    if (c.status !== "Open" && c.status !== "Pass") continue;
    const natural = c.dateCheckedOpen ? Number(c.dateCheckedOpen.slice(0, 4)) : c.transferDate ? Number(c.transferDate.slice(0, 4)) : thisYear;
    const year = x?.openYear && x.openYearRecord === c.id ? x.openYear : natural;
    out.push({ cowId: c.cowId, rec: c, year, added: false, totalAttempts: c.totalAttempts, timesPassed: c.timesPassed, repeatFlag: c.repeatFlag, dateCheckedOpen: c.dateCheckedOpen });
  }
  for (const x of cows.values()) {
    if (!x.addedOpen || withRecords.has(x.cowId) || x.offListRecord === "none") continue;
    const year = x.openYear && x.openYearRecord === "none" ? x.openYear : x.addedYear ?? thisYear;
    out.push({ cowId: x.cowId, rec: null, year, added: true, totalAttempts: 0, timesPassed: 0, repeatFlag: "New", dateCheckedOpen: null });
  }
  return out;
}

export function openList(calc: Calc[], cows: Map<string, CowExtra>, year: number, thisYear: number, sort: OpenSort = "Date Checked Open"): OpenEntry[] {
  const flagRank = (f: string) => (f === "NEVER SETTLED" ? 1 : f === "Repeat" ? 2 : 3);
  const cmp: Record<OpenSort, (a: OpenEntry, b: OpenEntry) => number> = {
    "Cow ID": () => 0,
    "Repeat Flag": (a, b) => flagRank(a.repeatFlag) - flagRank(b.repeatFlag),
    "Total Attempts": (a, b) => b.totalAttempts - a.totalAttempts,
    "Times Passed": (a, b) => b.timesPassed - a.timesPassed,
    "Date Checked Open": (a, b) => (a.dateCheckedOpen ?? "").localeCompare(b.dateCheckedOpen ?? ""),
  };
  return openEntries(calc, cows, thisYear)
    .filter((e) => e.year === year)
    .sort((a, b) => cmp[sort](a, b) || compareFamily(a.cowId, b.cowId));
}
export const openCull = (e: OpenEntry) => !!e.rec && cullFlag(e.rec);
export { OPEN_SORTS };
