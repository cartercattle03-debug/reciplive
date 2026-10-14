import { atomic, prisma } from "@/lib/prisma";

const KEEP = 15;

/** Everything on the ranch, as plain data. */
async function capture(orgId: string) {
  const w = { where: { organizationId: orgId } };
  const [batches, listItems, transfers, archive, cows] = await Promise.all([
    prisma.batch.findMany(w),
    prisma.listItem.findMany(w),
    prisma.transfer.findMany(w),
    prisma.pregArchive.findMany(w),
    prisma.cowRecord.findMany(w),
  ]);
  return { batches, listItems, transfers, archive, cows };
}

/**
 * Runs a big step all-or-nothing, with a copy of the records taken first so Undo can put them back.
 * Keeps the last 15 copies.
 */
export async function withSnapshot<T>(orgId: string, label: string, fn: () => Promise<T>): Promise<T> {
  return atomic(async () => {
    const data = await capture(orgId);
    await prisma.snapshot.create({ data: { organizationId: orgId, label, data: JSON.parse(JSON.stringify(data)) } });
    const old = await prisma.snapshot.findMany({ where: { organizationId: orgId }, orderBy: { createdAt: "desc" }, skip: KEEP, select: { id: true } });
    if (old.length) await prisma.snapshot.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    return fn();
  });
}

type Rows = Record<string, any>[];
const revive = (rows: Rows) => rows.map((r) => ({ ...r, createdAt: r.createdAt ? new Date(r.createdAt) : undefined, ...(r.updatedAt ? { updatedAt: new Date(r.updatedAt) } : {}) }));

/** Undo: puts the ranch back exactly as it was when that copy was taken (and keeps a copy of now, so the Undo can be undone). */
export async function restoreSnapshot(orgId: string, snapshotId: string) {
  const snap = await prisma.snapshot.findFirst({ where: { id: snapshotId, organizationId: orgId } });
  if (!snap) throw new Error("That backup is no longer kept.");
  const d = snap.data as unknown as { batches: Rows; listItems: Rows; transfers: Rows; archive: Rows; cows: Rows };
  await withSnapshot(orgId, `Before undo of "${snap.label}"`, async () => {
    const w = { where: { organizationId: orgId } };
    await prisma.pregArchive.deleteMany(w);
    await prisma.transfer.deleteMany(w);
    await prisma.cowRecord.deleteMany(w);
    await prisma.batch.deleteMany(w);
    await prisma.listItem.deleteMany(w);
    if (d.batches.length) await prisma.batch.createMany({ data: d.batches as any });
    if (d.listItems.length) await prisma.listItem.createMany({ data: d.listItems as any });
    if (d.transfers.length) await prisma.transfer.createMany({ data: revive(d.transfers) as any });
    if (d.archive.length) await prisma.pregArchive.createMany({ data: revive(d.archive) as any });
    if (d.cows.length) await prisma.cowRecord.createMany({ data: d.cows as any });
  });
}
