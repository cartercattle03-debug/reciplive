import * as XLSX from "xlsx";
import { prisma } from "@/lib/prisma";
import { ranchToday } from "@/lib/recip";

type Cell = string | number | boolean | null | undefined;
const sheet = (head: string[], rows: Cell[][], widths?: number[]) => {
  const ws = XLSX.utils.aoa_to_sheet([head, ...rows.map((r) => r.map((v) => (v === null || v === undefined ? "" : v)))]);
  ws["!cols"] = head.map((h, i) => ({ wch: widths?.[i] ?? Math.min(40, Math.max(h.length + 2, ...rows.slice(0, 500).map((r) => String(r[i] ?? "").length + 2))) }));
  ws["!freeze"] = { xSplit: 0, ySplit: 1 };
  return ws;
};

/**
 * The Backup (Carter, 2026-11-19 - "a master download to be used monthly to save a backup"): one Excel file with every
 * record this ranch keeps, one tab per kind, in plain headings. IDs, groups and grades stay text. Nothing about logins
 * or passwords; Undo copies aren't included (they are copies of these same records).
 */
export async function backupWorkbook(organizationId: string): Promise<{ file: Buffer; name: string }> {
  const [org, batches, lists, transfers, archive, cows, events, invoices, lines, holds] = await Promise.all([
    prisma.organization.findUnique({ where: { id: organizationId }, select: { name: true } }),
    prisma.batch.findMany({ where: { organizationId }, orderBy: { order: "asc" } }),
    prisma.listItem.findMany({ where: { organizationId }, orderBy: [{ kind: "asc" }, { order: "asc" }] }),
    prisma.transfer.findMany({ where: { organizationId }, orderBy: { seq: "asc" } }),
    prisma.pregArchive.findMany({ where: { organizationId }, orderBy: [{ checkDate: "asc" }, { createdAt: "asc" }] }),
    prisma.cowRecord.findMany({ where: { organizationId }, orderBy: { cowId: "asc" } }),
    prisma.cowEvent.findMany({ where: { organizationId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.invoice.findMany({ where: { organizationId }, orderBy: { number: "asc" } }),
    prisma.invoiceLine.findMany({ where: { organizationId }, orderBy: [{ invoiceId: "asc" }, { position: "asc" }] }),
    prisma.billHold.findMany({ where: { organizationId }, orderBy: { since: "asc" } }),
  ]);
  const today = ranchToday();
  const group = new Map(batches.map((b) => [b.label, b]));
  const invNo = new Map(invoices.map((i) => [i.id, i.number]));
  const byId = new Map(transfers.map((t) => [t.id, t]));
  // Transfers in the order of the groups on Lists, then as entered - the way the Transfers page reads.
  const ordered = [...transfers].sort((a, b) => (group.get(a.batch)?.order ?? 1e9) - (group.get(b.batch)?.order ?? 1e9) || a.seq - b.seq);

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      ["RecipLive backup", ""],
      [
        ["Ranch", org?.name ?? ""],
        ["Made", today],
        ["Transfers", transfers.length],
        ["Preg checks", archive.length],
        ["Cows on the Master Sheet", cows.length],
        ["Invoices", invoices.length],
        ["", ""],
        ["Keep this file somewhere safe (a computer folder, Google Drive, OneDrive) - one a month is plenty.", ""],
      ],
      [28, 60],
    ),
    "Read Me",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      ["Group", "Transfer Date", "Cow ID", "Mating", "Owner", "Tag Color", "Embryo Type", "Grade", "Company", "Status", "Delivery Status", "Delivery Date", "Due Date (typed)", "Notes", "Preg result typed (not confirmed)", "Its check date", "Entered"],
      ordered.map((t) => [t.batch, group.get(t.batch)?.transferDate ?? "", t.cowId, t.mating, t.owner, t.tagColor, t.embryoType, t.grade, t.company, t.status, t.deliveryStatus, t.deliveryDate, t.dueOverride, t.notes, t.pregDraft, t.pregDraftDate, t.createdAt.toISOString().slice(0, 10)]),
    ),
    "Transfers",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      ["Check Date", "Group", "Cow ID", "Mating", "Owner", "Result", "Status before"],
      archive.map((a) => [a.checkDate, a.batch, a.cowId, a.mating, a.owner, a.result, a.priorStatus]),
    ),
    "Preg Check History",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      ["Cow ID", "Purchase Date", "Loan Location", "Cost", "Sale Price", "Sold Date", "Transaction #", "Added to Open list", "Year added", "Open year"],
      cows.map((c) => [c.cowId, c.purchaseDate, c.loanLocation, c.cost, c.salePrice, c.soldDate, c.transactionNo, c.addedOpen ? "Yes" : "", c.addedYear, c.openYear]),
    ),
    "Master Sheet",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      ["Date", "Cow ID", "What", "Detail", "Group"],
      events.map((e) => [e.date, e.cowId, e.kind, e.detail, e.transferId ? byId.get(e.transferId)?.batch ?? "" : ""]),
    ),
    "Cow Events",
  );
  XLSX.utils.book_append_sheet(wb, sheet(["Group", "Transfer Date", "Order"], batches.map((b) => [b.label, b.transferDate, b.order])), "Groups");
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      ["List", "Value", "Billing ranch name", "Billing location", "Billing email"],
      lists.map((l) => [{ OWNER: "Owner", COMPANY: "Company", GRADE: "Grade" }[l.kind] ?? l.kind, l.value, l.ranchName, l.location, l.email]),
    ),
    "Lists",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      ["Invoice #", "Owner", "Bill To", "Ranch", "Location", "Email", "Invoice Date", "Due Date", "Price", "Item", "Memo", "Status", "Sent to QuickBooks"],
      invoices.map((i) => [i.number, i.owner, i.billTo, i.billRanch, i.billLocation, i.billEmail, i.invoiceDate, i.dueDate, i.price, i.item, i.memo, i.status, i.exportedAt ? i.exportedAt.toISOString().slice(0, 10) : ""]),
    ),
    "Invoices",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      ["Invoice #", "Kind", "Description", "Cow ID", "Group", "Transfer Date", "Mating", "Due Date", "Confirmed", "Days Preg", "Amount"],
      lines.map((l) => [invNo.get(l.invoiceId) ?? "", l.kind, l.description, l.cowId, l.batch, l.transferDate, l.mating, l.dueDate, l.confirmedDate, l.daysPreg, l.amount]),
    ),
    "Invoice Lines",
  );
  XLSX.utils.book_append_sheet(
    wb,
    sheet(
      ["Cow ID", "Group", "Held since", "From invoice #"],
      holds.map((h) => [byId.get(h.transferId)?.cowId ?? "", byId.get(h.transferId)?.batch ?? "", h.since, h.fromInvoice]),
    ),
    "Billing Holds",
  );
  const file = XLSX.write(wb, { type: "buffer", bookType: "xlsx" }) as Buffer;
  const safe = (org?.name ?? "RecipLive").replace(/[^\w .-]/g, "").trim() || "RecipLive";
  return { file, name: `${safe} RecipLive backup ${today}.xlsx` };
}
