/** What the reader copies off a paper transfer or preg check sheet (Carter, 2026-11-18). Shared by server and screen. */
export type PaperKind = "transfer" | "preg";
export const PAPER_FIELDS = ["cowId", "group", "mating", "sire", "donor", "owner", "tagColor", "company", "embryoType", "grade", "status", "result", "checkDate", "notes"] as const;
export type PaperField = (typeof PAPER_FIELDS)[number];
export type PaperRow = Record<PaperField, string> & { unsure: PaperField[]; why: string; struck: boolean };
export type PaperPage = {
  title: string;
  /** Filled-in blanks above the table: transfer date, group, owner, company, check date. */
  header: { transferDate: string; group: string; owner: string; company: string; checkDate: string };
  rows: PaperRow[];
  /** IDs listed outside the table with their label ("Pass: 37, 6314"). */
  lists: { label: string; ids: string[] }[];
  remarks: string;
};
/** Pages a ranch can read each month (the first ranch - Carter's - has no cap). */
export const PAPER_MONTHLY = 100;

/** A result as written on a preg sheet, as RecipLive's word. "P", "Prob", "+" = Probable; "S" / "Safe" = Safe; "O", "Open", "-", "NP" = Open. Anything else (an X, a check mark) is left for the owner to tap. */
export function readResult(v: string): "Probable" | "Safe" | "Open" | "" {
  const t = v.trim().toLowerCase().replace(/[.\s]/g, "");
  if (!t) return "";
  if (/^(o|open|op|np|notpreg|-|—|empty)$/.test(t)) return "Open";
  if (/^(s|safe|sf|75|confirmed|conf)$/.test(t)) return "Safe";
  if (/^(p|prob|probable|pr|\+|yes|y|preg|pregnant|bred|pg)$/.test(t)) return "Probable";
  return "";
}

/** "Sire x Donor" when the sheet gives them apart and no mating is written. */
export function matingOf(r: Pick<PaperRow, "mating" | "sire" | "donor">): string {
  if (r.mating.trim()) return r.mating.trim();
  const s = r.sire.trim();
  const d = r.donor.trim();
  return s && d ? `${s} x ${d}` : s || d;
}
