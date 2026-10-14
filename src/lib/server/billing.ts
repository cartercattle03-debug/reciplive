import { atomic, prisma } from "@/lib/prisma";
import { addDays, ranchToday } from "@/lib/recip";
import { billable, billKey, daysPregOn, lineFor, type InvoiceForExport } from "@/lib/billing";
import { loadRanch } from "./data";
import { HttpError } from "./session";

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);
const money = (v: unknown, what: string) => {
  const s = clean(v).replace(/[$,\s]/g, "");
  if (s === "" || isNaN(Number(s))) throw new HttpError(400, `${what} is a dollar amount.`);
  return Math.round(Number(s) * 100) / 100;
};

export async function billingSettings(orgId: string) {
  const o = await prisma.organization.findUnique({ where: { id: orgId } });
  return { price: o?.invoicePrice ?? null, item: o?.invoiceItem || "Confirmed Pregnancy", adjustItem: o?.adjustItem || "Adjustment", terms: o?.invoiceTerms ?? 0, nextNo: o?.nextInvoiceNo ?? 1001 };
}

export async function saveBillingSettings(orgId: string, b: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  if (b.price !== undefined) data.invoicePrice = clean(b.price) ? money(b.price, "Price") : null;
  if (b.item !== undefined) data.invoiceItem = clean(b.item) || null;
  if (b.adjustItem !== undefined) data.adjustItem = clean(b.adjustItem) || null;
  if (b.terms !== undefined) {
    const t = clean(b.terms);
    if (t && !/^\d+$/.test(t)) throw new HttpError(400, "Terms is a number of days.");
    data.invoiceTerms = t ? Number(t) : null;
  }
  if (b.nextNo !== undefined) {
    const n = clean(b.nextNo);
    if (!/^\d+$/.test(n)) throw new HttpError(400, "Invoice number is a whole number.");
    const taken = await prisma.invoice.findFirst({ where: { organizationId: orgId, number: { gte: Number(n) } } });
    if (taken) throw new HttpError(400, `Invoice #${taken.number} is already used - the next number has to be higher.`);
    data.nextInvoiceNo = Number(n);
  }
  await prisma.organization.update({ where: { id: orgId }, data: data as any });
}

/** Records already on an invoice that's still open (not void). */
export async function billedIds(orgId: string) {
  const open = await prisma.invoice.findMany({ where: { organizationId: orgId, status: { not: "Void" } }, select: { id: true } });
  if (!open.length) return new Set<string>();
  const lines = await prisma.invoiceLine.findMany({ where: { organizationId: orgId, invoiceId: { in: open.map((i) => i.id) }, transferId: { not: null } }, select: { transferId: true, cowId: true, batch: true, mating: true } });
  // By record, and by cow + group + mating too - so a workbook re-import (new record ids) can't bill her twice.
  return new Set(lines.flatMap((l) => [l.transferId!, billKey(l.cowId, l.batch, l.mating)]));
}

/** Build invoices from the ticked confirmed pregnancies - one invoice per owner. */
export async function createInvoices(orgId: string, rawIds: unknown, invoiceDate?: unknown, rawUnpicked?: unknown) {
  const unpicked = [...new Set((Array.isArray(rawUnpicked) ? rawUnpicked : []).map(String))];
  const ids = [...new Set((Array.isArray(rawIds) ? rawIds : []).map(String))];
  if (!ids.length) throw new HttpError(400, "Tick at least one cow to bill.");
  const date = clean(invoiceDate) || ranchToday();
  if (!isYmd(date)) throw new HttpError(400, "Pick the invoice date.");
  const { calc, archive } = await loadRanch(orgId);
  const set = await billingSettings(orgId);
  const ready = new Map(billable(calc, archive, await billedIds(orgId)).map((l) => [l.transferId, l]));
  const missing = ids.filter((id) => !ready.has(id));
  if (missing.length) throw new HttpError(400, "Some of those are already billed or no longer confirmed Safe - refresh the page.");
  const byOwner = new Map<string, string[]>();
  for (const id of ids) {
    const o = ready.get(id)!.owner || "(no owner)";
    if (!byOwner.has(o)) byOwner.set(o, []);
    byOwner.get(o)!.push(id);
  }
  const info = new Map(
    (await prisma.listItem.findMany({ where: { organizationId: orgId, kind: "OWNER" } })).map((o) => [o.value.toLowerCase(), o])
  );
  return atomic(async () => {
    let no = set.nextNo;
    const made: number[] = [];
    for (const [owner, list] of byOwner) {
      const inv = await prisma.invoice.create({
        data: {
          organizationId: orgId,
          number: no,
          owner,
          billTo: owner,
          billRanch: info.get(owner.toLowerCase())?.ranchName ?? "",
          billLocation: info.get(owner.toLowerCase())?.location ?? "",
          billEmail: info.get(owner.toLowerCase())?.email ?? "",
          invoiceDate: date,
          dueDate: addDays(date, set.terms),
          price: set.price ?? 0,
          item: set.item,
        },
      });
      await prisma.invoiceLine.createMany({
        data: list.map((id, i) => {
          const l = ready.get(id)!;
          return { invoiceId: inv.id, organizationId: orgId, kind: "Pregnancy", position: i, transferId: id, cowId: l.cowId, batch: l.batch, transferDate: l.transferDate, mating: l.mating, dueDate: l.dueDate, confirmedDate: l.confirmedDate, daysPreg: l.daysPreg, amount: set.price ?? 0 };
        }),
      });
      made.push(no);
      no++;
    }
    await prisma.organization.update({ where: { id: orgId }, data: { nextInvoiceNo: no } });
    // Billed now: no longer held back. Left unticked (and not already held): held back, with the invoice she missed.
    await prisma.billHold.deleteMany({ where: { organizationId: orgId, transferId: { in: ids } } });
    const held = new Set((await prisma.billHold.findMany({ where: { organizationId: orgId }, select: { transferId: true } })).map((h) => h.transferId));
    const left = unpicked.filter((id) => ready.has(id) && !ids.includes(id) && !held.has(id));
    if (left.length) await prisma.billHold.createMany({ data: left.map((transferId) => ({ organizationId: orgId, transferId, since: date, fromInvoice: made[0] })) });
    return { made, held: left.length };
  });
}

async function openInvoice(orgId: string, id: string) {
  const inv = await prisma.invoice.findFirst({ where: { id, organizationId: orgId } });
  if (!inv) throw new HttpError(404, "That invoice is gone - refresh the page.");
  if (inv.status === "Void") throw new HttpError(400, "This invoice is void - it can't be changed.");
  return inv;
}

/** Bill-to, dates, memo - and the price, which can be put on every pregnancy line at once. */
export async function updateInvoice(orgId: string, id: string, b: Record<string, unknown>) {
  const inv = await openInvoice(orgId, id);
  const set = await billingSettings(orgId);
  await atomic(async () => {
    const data: Record<string, unknown> = {};
    if (b.billTo !== undefined) {
      if (!clean(b.billTo)) throw new HttpError(400, "Bill To can't be blank - it must match the customer in QuickBooks.");
      data.billTo = clean(b.billTo);
    }
    if (b.memo !== undefined) data.memo = clean(b.memo);
    for (const k of ["billRanch", "billLocation", "billEmail"] as const) if (b[k] !== undefined) data[k] = clean(b[k]);
    if (b.invoiceDate !== undefined) {
      const d = clean(b.invoiceDate);
      if (!isYmd(d)) throw new HttpError(400, "Pick the invoice date.");
      data.invoiceDate = d;
      if (b.dueDate === undefined) data.dueDate = addDays(d, set.terms);
    }
    if (b.dueDate !== undefined) {
      const d = clean(b.dueDate);
      if (!isYmd(d)) throw new HttpError(400, "Pick the payment due date.");
      data.dueDate = d;
    }
    if (b.price !== undefined) {
      const p = money(b.price, "Price");
      data.price = p;
      if (b.applyAll) await prisma.invoiceLine.updateMany({ where: { invoiceId: inv.id, kind: "Pregnancy" }, data: { amount: p } });
    }
    await prisma.invoice.update({ where: { id: inv.id }, data: data as any });
  });
}

/** One line: its amount, an adjustment's description, a pregnancy's confirmed date (days pregnant follows). */
export async function updateLine(orgId: string, lineId: string, b: Record<string, unknown>) {
  const line = await prisma.invoiceLine.findFirst({ where: { id: lineId, organizationId: orgId } });
  if (!line) throw new HttpError(404, "That line is gone - refresh the page.");
  await openInvoice(orgId, line.invoiceId);
  const data: Record<string, unknown> = {};
  if (b.amount !== undefined) data.amount = money(b.amount, "Amount");
  if (b.description !== undefined) data.description = clean(b.description);
  if (b.confirmedDate !== undefined) {
    const d = clean(b.confirmedDate);
    if (d && !isYmd(d)) throw new HttpError(400, "Pick the date she was confirmed.");
    data.confirmedDate = d || null;
    data.daysPreg = daysPregOn({ transferDate: line.transferDate }, d || null);
  }
  await prisma.invoiceLine.update({ where: { id: line.id }, data: data as any });
}

export async function addAdjustment(orgId: string, invoiceId: string, description: unknown, amount: unknown) {
  const inv = await openInvoice(orgId, invoiceId);
  const desc = clean(description);
  if (!desc) throw new HttpError(400, "Say what the adjustment is for.");
  const n = await prisma.invoiceLine.count({ where: { invoiceId: inv.id } });
  await prisma.invoiceLine.create({ data: { invoiceId: inv.id, organizationId: orgId, kind: "Adjustment", description: desc, position: n, amount: money(amount, "Amount") } });
}

export async function billHolds(orgId: string) {
  return new Map((await prisma.billHold.findMany({ where: { organizationId: orgId } })).map((h) => [h.transferId, h]));
}

/** Take a line off. A pregnancy taken off goes back to Ready to bill. */
export async function removeLine(orgId: string, lineId: string) {
  const line = await prisma.invoiceLine.findFirst({ where: { id: lineId, organizationId: orgId } });
  if (!line) return;
  await openInvoice(orgId, line.invoiceId);
  await prisma.invoiceLine.delete({ where: { id: line.id } });
}

/** Void: the invoice stays on file (its number is never reused) and its cows can be billed again. */
export async function voidInvoice(orgId: string, id: string) {
  const inv = await openInvoice(orgId, id);
  await prisma.invoice.update({ where: { id: inv.id }, data: { status: "Void" } });
}

/** The invoices for the QuickBooks file, marked as exported. */
export async function invoicesForExport(orgId: string, ids: string[] | "pending") {
  const set = await billingSettings(orgId);
  const where = ids === "pending" ? { organizationId: orgId, status: "Open", exportedAt: null } : { organizationId: orgId, id: { in: ids }, status: "Open" };
  const list = await prisma.invoice.findMany({ where: where as any, include: { lines: true }, orderBy: { number: "asc" } });
  if (list.length) await prisma.invoice.updateMany({ where: { id: { in: list.map((i) => i.id) } }, data: { exportedAt: new Date() } });
  return list.map(
    (i): InvoiceForExport => ({
      number: i.number,
      billTo: i.billTo,
      invoiceDate: i.invoiceDate,
      dueDate: i.dueDate,
      terms: set.terms,
      item: i.item,
      adjustItem: set.adjustItem,
      memo: i.memo,
      lines: [...i.lines].sort((a, b) => a.position - b.position).map((l) => ({ ...l })),
    })
  );
}

export { lineFor };

export type Letterhead = { name: string; address: string; phone: string; email: string; logo: string | null };

export async function letterhead(orgId: string, ranch: string): Promise<Letterhead> {
  const o = await prisma.organization.findUnique({ where: { id: orgId } });
  return { name: o?.lhName || ranch, address: o?.lhAddress || "", phone: o?.lhPhone || "", email: o?.lhEmail || "", logo: o?.lhLogo || null };
}

/** The invoice header. The logo comes from the browser already shrunk to a small picture (under ~400 KB). */
export async function saveLetterhead(orgId: string, b: Record<string, unknown>) {
  const data: Record<string, unknown> = {};
  for (const [k, f] of [["name", "lhName"], ["phone", "lhPhone"], ["email", "lhEmail"]] as const) if (b[k] !== undefined) data[f] = clean(b[k]) || null;
  if (b.address !== undefined) data.lhAddress = String(b.address ?? "").replace(/\r/g, "").split("\n").map((l) => l.trim()).filter(Boolean).join("\n") || null;
  if (b.logo !== undefined) {
    const v = String(b.logo ?? "");
    if (v && !/^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/.test(v)) throw new HttpError(400, "The logo has to be a picture (PNG or JPG).");
    if (v.length > 600_000) throw new HttpError(400, "That logo is too big - try a smaller picture.");
    data.lhLogo = v || null;
  }
  await prisma.organization.update({ where: { id: orgId }, data: data as any });
}

/** An owner's billing info: Ranch Name, Location, Email Address. New invoices for them start with it. */
export async function saveOwnerInfo(orgId: string, id: string, b: Record<string, unknown>) {
  const o = await prisma.listItem.findFirst({ where: { id, organizationId: orgId, kind: "OWNER" } });
  if (!o) throw new HttpError(404, "That owner is gone - refresh the page.");
  const data: Record<string, unknown> = {};
  for (const k of ["ranchName", "location", "email"] as const) if (b[k] !== undefined) data[k] = clean(b[k]) || null;
  if (data.email && !/^\S+@\S+\.\S+$/.test(String(data.email))) throw new HttpError(400, "That email address doesn't look right.");
  await prisma.listItem.update({ where: { id: o.id }, data: data as any });
  // Open invoices for this owner that have nothing typed in yet pick it up too.
  if (b.fillOpen !== false) {
    const open = await prisma.invoice.findMany({ where: { organizationId: orgId, owner: o.value, status: "Open" } });
    for (const inv of open) {
      const fill: Record<string, unknown> = {};
      if (data.ranchName !== undefined && !inv.billRanch) fill.billRanch = data.ranchName ?? "";
      if (data.location !== undefined && !inv.billLocation) fill.billLocation = data.location ?? "";
      if (data.email !== undefined && !inv.billEmail) fill.billEmail = data.email ?? "";
      if (Object.keys(fill).length) await prisma.invoice.update({ where: { id: inv.id }, data: fill as any });
    }
  }
}
