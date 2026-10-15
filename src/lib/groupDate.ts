/** The transfer date a group label reads as: 7-31 -> July 31 of the year picked (7-31-25 or 7/31/2025 carry their own year). */
export function dateFromLabel(label: string, year: number): string {
  const m = label.trim().match(/^(\d{1,2})\s*[-/.]\s*(\d{1,2})(?:\s*[-/.]\s*(\d{2}|\d{4}))?$/);
  if (!m) return "";
  const mo = +m[1];
  const d = +m[2];
  const y = m[3] ? (m[3].length === 2 ? 2000 + +m[3] : +m[3]) : year;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (mo < 1 || mo > 12 || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) return "";
  return `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}
