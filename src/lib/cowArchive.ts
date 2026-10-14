/**
 * The Master Archive: every cow's whole story in order - bought (ID, purchase, cost), every transfer, every Pass,
 * every preg check result, delivered, culled, sold. Put together live from the records, so nothing can drift apart.
 */
import { compareFamily, type ArchiveRow, type Calc, type CowExtra } from "./recip";

export type CowEventRow = { cowId: string; date: string; kind: string; detail: string; transferId: string | null };

export type Step = {
  cowId: string;
  /** YYYY-MM-DD when known. */
  date: string | null;
  /** Text shown when the date is a season ("Fall 2025") or isn't recorded. */
  when: string;
  process: "Purchased" | "Transfer" | "Pass" | "Preg Check" | "Delivered" | "Culled" | "Sold";
  batch: string;
  mating: string;
  owner: string;
  embryoType: string;
  grade: string;
  company: string;
  result: string;
  money: number | null;
  notes: string;
  /** Her attempt # for a transfer / Pass line. */
  attempt: number | null;
};

const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();
const ymd = (s: string) => (/^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null);

export function cowArchive(calc: Calc[], archive: ArchiveRow[], cows: Map<string, CowExtra>, events: CowEventRow[], only?: string): Step[] {
  const ids = new Set<string>();
  for (const c of calc) ids.add(c.cowId);
  for (const k of cows.keys()) ids.add(k);
  const list = [...ids].filter((id) => id && (!only || same(id, only))).sort(compareFamily);
  const out: Step[] = [];
  for (const id of list) {
    const mine = calc.filter((c) => c.cowId === id).sort((a, b) => a.attemptNo - b.attemptNo);
    const steps: (Step & { order: number })[] = [];
    const base = { cowId: id, batch: "", mating: "", owner: "", embryoType: "", grade: "", company: "", result: "", money: null, notes: "", attempt: null };
    const x = cows.get(id);
    if (x && (x.purchaseDate || x.cost !== null || x.loanLocation))
      steps.push({ ...base, date: null, when: x.purchaseDate, process: "Purchased", result: x.loanLocation, money: x.cost, order: -1 });
    mine.forEach((c, i) => {
      const pass = c.status === "Pass";
      steps.push({ ...base, date: c.transferDate, when: "", process: pass ? "Pass" : "Transfer", batch: c.batch, mating: c.mating, owner: c.owner, embryoType: c.embryoType, grade: c.grade, company: c.company, result: c.status, notes: c.notes, attempt: c.attemptNo, order: i * 10 });
      // Preg checks on this record (same batch and mating), in date order.
      archive
        .filter((a) => a.cowId === id && same(a.batch, c.batch) && same(a.mating, c.mating))
        .sort((a, b) => a.checkDate.localeCompare(b.checkDate))
        .forEach((a, k) => steps.push({ ...base, date: ymd(a.checkDate), when: "", process: "Preg Check", batch: c.batch, mating: c.mating, owner: a.owner || c.owner, result: a.result, order: i * 10 + 1 + k / 100 }));
      if (c.deliveryStatus === "Delivered" || c.deliveryDate) steps.push({ ...base, date: c.deliveryDate, when: c.deliveryDate ? "" : "date not recorded", process: "Delivered", batch: c.batch, owner: c.owner, result: c.deliveryStatus || "Delivered", order: i * 10 + 5 });
    });
    // Preg check lines whose record is gone (or whose batch / mating was changed) still show, by date.
    for (const a of archive.filter((a) => a.cowId === id && !mine.some((c) => same(a.batch, c.batch) && same(a.mating, c.mating))))
      steps.push({ ...base, date: ymd(a.checkDate), when: "", process: "Preg Check", batch: a.batch, mating: a.mating, owner: a.owner, result: a.result, order: 9000 });
    // Culls: the dated ones, plus a Culled record from before dates were kept.
    const culls = events.filter((e) => e.cowId === id && e.kind === "Culled");
    for (const e of culls) steps.push({ ...base, date: ymd(e.date), when: "", process: "Culled", result: e.detail, order: 9500 });
    for (const c of mine.filter((c) => c.status === "Culled" && !culls.some((e) => e.transferId === c.id)))
      steps.push({ ...base, date: null, when: "date not recorded", process: "Culled", batch: c.batch, order: 9600 });
    if (x && (x.salePrice !== null || x.soldDate || x.transactionNo))
      steps.push({ ...base, date: ymd(x.soldDate), when: ymd(x.soldDate) ? "" : x.soldDate, process: "Sold", result: x.transactionNo ? `Transaction # ${x.transactionNo}` : "", money: x.salePrice, order: 99999 });
    // In order: by date. A line with no date stays right after the line before it in her life (an undated cull after her last record).
    steps.sort((a, b) => a.order - b.order);
    let carry = "";
    const keyed = steps.map((st) => {
      if (st.date) carry = st.date;
      return { st, key: st.process === "Purchased" ? "0000" : st.process === "Sold" ? "9999" : st.date ?? carry };
    });
    keyed.sort((a, b) => a.key.localeCompare(b.key) || a.st.order - b.st.order);
    steps.splice(0, steps.length, ...keyed.map((k) => k.st));
    out.push(...steps.map(({ order, ...s }) => s));
  }
  return out;
}
