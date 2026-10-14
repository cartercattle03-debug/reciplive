/**
 * Billing for confirmed 75-day pregnancies (Carter, 2026-10-14).
 * A record is billable once it is Safe (and its outcome is Safe - a culled cow is a failed pregnancy, never billed)
 * and it isn't already on an invoice that's still open. Pure functions - no database here.
 */
import { addDays, daysBetween, DUE_DAYS, EMBRYO_AGE_AT_TRANSFER, showDate, type ArchiveRow, type Calc } from "./recip";

export type BillLine = {
  transferId: string;
  cowId: string;
  owner: string;
  batch: string;
  transferDate: string | null;
  mating: string;
  dueDate: string | null;
  confirmedDate: string | null;
  daysPreg: number | null;
};

const key = (batch: string, cow: string, mating: string) => `${batch.trim().toLowerCase()}|${cow.trim().toLowerCase()}|${mating.trim().toLowerCase()}`;

/** The day she was confirmed: her last Safe preg check on that record. */
export function confirmedOn(c: Calc, archive: ArchiveRow[]): string | null {
  const k = key(c.batch, c.cowId, c.mating);
  const safe = archive.filter((a) => a.result === "Safe" && key(a.batch, a.cowId, a.mating) === k).map((a) => a.checkDate).filter(Boolean).sort();
  return safe.length ? safe[safe.length - 1] : null;
}

/** Days pregnant on a date: days since transfer + 7 (a 7-day embryo at transfer); a hand-typed Due Date wins. */
export function daysPregOn(c: { transferDate: string | null; dueOverride?: string | null }, date: string | null): number | null {
  if (!date) return null;
  const start = c.dueOverride ? addDays(c.dueOverride, -DUE_DAYS) : c.transferDate;
  return start ? daysBetween(start, date) + EMBRYO_AGE_AT_TRANSFER : null;
}

export function lineFor(c: Calc, archive: ArchiveRow[], confirmed?: string | null): BillLine {
  const date = confirmed ?? confirmedOn(c, archive);
  return { transferId: c.id, cowId: c.cowId, owner: c.owner, batch: c.batch, transferDate: c.transferDate, mating: c.mating, dueDate: c.dueDate, confirmedDate: date, daysPreg: daysPregOn(c, date) };
}

/** The same pregnancy, however its record id changes: cow + group + mating. */
export const billKey = (cowId: string, batch: string, mating: string) => `k:${key(batch, cowId, mating)}`;

/** Everything confirmed and not yet on an open invoice. */
export function billable(calc: Calc[], archive: ArchiveRow[], billed: Set<string>): BillLine[] {
  return calc.filter((c) => c.status === "Safe" && c.outcome === "Safe" && c.cowId && !billed.has(c.id) && !billed.has(billKey(c.cowId, c.batch, c.mating))).map((c) => lineFor(c, archive));
}

export type InvoiceForExport = {
  number: number;
  billTo: string;
  invoiceDate: string;
  dueDate: string;
  terms: number;
  item: string;
  memo: string;
  adjustItem: string;
  lines: { kind: string; description: string; cowId: string; batch: string; transferDate: string | null; mating: string; dueDate: string | null; confirmedDate: string | null; daysPreg: number | null; amount: number }[];
};

const csvCell = (v: string | number | null | undefined) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One line per pregnancy, shown on the invoice and in QuickBooks. */
export function lineText(l: InvoiceForExport["lines"][number]) {
  if (l.kind === "Adjustment") return l.description || "Adjustment";
  return [
    `Cow ${l.cowId}`,
    l.mating,
    l.transferDate ? `Transferred ${showDate(l.transferDate)}` : "",
    l.confirmedDate ? `Confirmed ${showDate(l.confirmedDate)}` : "",
    l.daysPreg !== null ? `${l.daysPreg} days pregnant` : "",
    l.dueDate ? `Due ${showDate(l.dueDate)}` : "",
  ]
    .filter(Boolean)
    .join(" | ");
}

/**
 * QuickBooks Online invoice import (Sales > Invoices > Import invoices): one row per pregnancy, rows with the same
 * InvoiceNo make one invoice. Dates are MM/DD/YYYY. The Customer must match the QuickBooks customer name.
 */
export function qboCsv(invoices: InvoiceForExport[]): string {
  const head = ["InvoiceNo", "Customer", "InvoiceDate", "DueDate", "Terms", "Memo", "Item(Product/Service)", "ItemDescription", "ItemQuantity", "ItemRate", "ItemAmount", "ServiceDate"];
  const d = (s: string | null) => (s ? `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}` : "");
  const out = [head.join(",")];
  for (const inv of invoices)
    for (const l of inv.lines)
      out.push(
        [inv.number, inv.billTo, d(inv.invoiceDate), d(inv.dueDate), `Net ${inv.terms}`, inv.memo, l.kind === "Adjustment" ? inv.adjustItem : inv.item, lineText(l), 1, l.amount.toFixed(2), l.amount.toFixed(2), l.kind === "Adjustment" ? "" : d(l.confirmedDate)]
          .map(csvCell)
          .join(",")
      );
  return out.join("\r\n") + "\r\n";
}
