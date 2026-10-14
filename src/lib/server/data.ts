import { prisma } from "@/lib/prisma";
import { calculate, ranchToday, type ArchiveRow, type Calc, type CowExtra, type Transfer } from "@/lib/recip";
import type { CowEventRow } from "@/lib/cowArchive";

export type Lists = {
  batches: { id: string; label: string; transferDate: string | null; order: number }[];
  owners: string[];
  companies: string[];
  grades: string[];
};

export async function loadLists(orgId: string): Promise<Lists> {
  const [batches, items] = await Promise.all([
    prisma.batch.findMany({ where: { organizationId: orgId }, orderBy: { order: "asc" } }),
    prisma.listItem.findMany({ where: { organizationId: orgId }, orderBy: { order: "asc" } }),
  ]);
  const of = (k: string) => items.filter((i) => i.kind === k).map((i) => i.value);
  return { batches: batches.map((b) => ({ id: b.id, label: b.label, transferDate: b.transferDate, order: b.order })), owners: of("OWNER"), companies: of("COMPANY"), grades: of("GRADE") };
}

/** Everything a page needs: the transfer list worked out live, the lists, the archive and the Master Sheet entries. */
export async function loadRanch(orgId: string, opts: { owner?: string | null } = {}) {
  const [lists, rows, archiveRows, cowRows, eventRows] = await Promise.all([
    loadLists(orgId),
    prisma.transfer.findMany({ where: { organizationId: orgId }, orderBy: { seq: "asc" } }),
    prisma.pregArchive.findMany({ where: { organizationId: orgId }, orderBy: [{ checkDate: "asc" }, { createdAt: "asc" }] }),
    prisma.cowRecord.findMany({ where: { organizationId: orgId } }),
    prisma.cowEvent.findMany({ where: { organizationId: orgId }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
  ]);
  const byLabel = new Map(lists.batches.map((b) => [b.label.toLowerCase(), b]));
  const transfers: Transfer[] = rows.map((r) => {
    const b = byLabel.get(r.batch.toLowerCase());
    return {
      id: r.id,
      seq: r.seq,
      batch: r.batch,
      batchOrder: b?.order ?? 0,
      transferDate: b?.transferDate ?? null,
      cowId: r.cowId,
      mating: r.mating,
      owner: r.owner,
      embryoType: r.embryoType,
      grade: r.grade,
      company: r.company,
      status: r.status,
      deliveryStatus: r.deliveryStatus,
      deliveryDate: r.deliveryDate,
      notes: r.notes,
      pregDraft: r.pregDraft,
      pregDraftDate: r.pregDraftDate,
    };
  });
  const archive: ArchiveRow[] = archiveRows.map((a) => ({ checkDate: a.checkDate, batch: a.batch, cowId: a.cowId, mating: a.mating, owner: a.owner, result: a.result }));
  const today = ranchToday();
  let calc: Calc[] = calculate(transfers, archive, today);
  // A customer login: only that owner's records, and only cows that are theirs.
  if (opts.owner) {
    const o = opts.owner.toLowerCase();
    calc = calc.filter((c) => c.owner.toLowerCase() === o);
  }
  const cows = new Map<string, CowExtra>(
    cowRows.map((c) => [
      c.cowId,
      { cowId: c.cowId, purchaseDate: c.purchaseDate, loanLocation: c.loanLocation, cost: c.cost, salePrice: c.salePrice, soldDate: c.soldDate, transactionNo: c.transactionNo, addedOpen: c.addedOpen, addedYear: c.addedYear, offListRecord: c.offListRecord, openYear: c.openYear, openYearRecord: c.openYearRecord },
    ])
  );
  const events: CowEventRow[] = eventRows.map((e) => ({ cowId: e.cowId, date: e.date, kind: e.kind, detail: e.detail, transferId: e.transferId }));
  return { lists, calc, archive, archiveRows, cows, events, today };
}
