import { atomic, prisma } from "@/lib/prisma";
import { DELIVERY, EMBRYO_TYPES, PREG_RESULTS, STATUSES, ranchToday } from "@/lib/recip";
import type { ParsedWorkbook } from "@/lib/workbook";
import { HttpError } from "./session";
import { withSnapshot } from "./snapshot";
import { loadRanch } from "./data";
import { latestRows } from "@/lib/recip";

export const TRANSFER_FIELDS = ["batch", "cowId", "mating", "owner", "embryoType", "grade", "company", "status", "deliveryStatus", "deliveryDate", "dueOverride", "notes"] as const;
export type TransferField = (typeof TRANSFER_FIELDS)[number];
const LIST_KIND: Partial<Record<TransferField, string>> = { owner: "OWNER", company: "COMPANY", grade: "GRADE" };

const clean = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim();
const isYmd = (s: string) => /^\d{4}-\d{2}-\d{2}$/.test(s);

/** Checks one value for one column; an owner / company / grade not on the lists yet joins them. */
async function checkValue(orgId: string, field: TransferField, raw: unknown): Promise<string | null> {
  const v = clean(raw);
  switch (field) {
    case "cowId":
      if (!v) throw new HttpError(400, "Cow ID can't be blank.");
      return v;
    case "batch": {
      if (!v) return "";
      const b = await prisma.batch.findFirst({ where: { organizationId: orgId, label: { equals: v, mode: "insensitive" } } });
      if (!b) throw new HttpError(400, `Group "${v}" isn't on Lists yet - add it there first (with its transfer date).`);
      return b.label;
    }
    case "status":
      if (v && !(STATUSES as readonly string[]).includes(v)) throw new HttpError(400, `Status must be one of: ${STATUSES.join(", ")}.`);
      return v;
    case "embryoType":
      if (v && !(EMBRYO_TYPES as readonly string[]).includes(v)) throw new HttpError(400, "Embryo Type is Fresh or Frozen.");
      return v;
    case "deliveryStatus":
      if (v && !(DELIVERY as readonly string[]).includes(v)) throw new HttpError(400, "Delivery Status is Delivered or Undelivered.");
      return v;
    case "dueOverride":
      if (v && !isYmd(v)) throw new HttpError(400, "Pick a due date.");
      return v || null;
    case "deliveryDate":
      if (v && !isYmd(v)) throw new HttpError(400, "Pick a delivery date.");
      return v || null;
    default: {
      const kind = LIST_KIND[field];
      if (kind && v) {
        const have = await prisma.listItem.findFirst({ where: { organizationId: orgId, kind, value: { equals: v, mode: "insensitive" } } });
        if (have) return have.value;
        const n = await prisma.listItem.count({ where: { organizationId: orgId, kind } });
        await prisma.listItem.create({ data: { organizationId: orgId, kind, value: v, order: n + 1 } });
      }
      return v;
    }
  }
}

export async function updateTransfer(orgId: string, id: string, field: string, value: unknown) {
  if (!(TRANSFER_FIELDS as readonly string[]).includes(field)) throw new HttpError(400, "That column can't be edited.");
  const row = await prisma.transfer.findFirst({ where: { id, organizationId: orgId } });
  if (!row) throw new HttpError(404, "That record is gone - refresh the page.");
  const v = await checkValue(orgId, field as TransferField, value);
  await atomic(async () => {
    await prisma.transfer.update({ where: { id }, data: { [field]: v } as any });
    // A cull keeps its date in her archive, however it was made.
    if (field === "status" && v === "Culled" && row.status !== "Culled") await logCull(orgId, row.cowId, row.id, row.status);
  });
}

async function logCull(orgId: string, cowId: string, transferId: string | null, was: string) {
  await prisma.cowEvent.create({ data: { organizationId: orgId, cowId, date: ranchToday(), kind: "Culled", detail: was ? `was ${was}` : "", transferId } });
}

/** Edit from a pop-up (Open Inventory): only the columns that changed, all or nothing. */
export async function editTransfer(orgId: string, id: string, patch: Record<string, unknown>) {
  const fields = Object.keys(patch ?? {}).filter((f) => (TRANSFER_FIELDS as readonly string[]).includes(f));
  if (!fields.length) throw new HttpError(400, "Nothing changed.");
  await atomic(async () => {
    for (const f of fields) await updateTransfer(orgId, id, f, patch[f]);
  });
}

/** Cull the checked cows: her record (the latest one, from Open Inventory) turns Culled and the date goes in her archive. */
export async function cullTransfers(orgId: string, ids: string[]) {
  const rows = await prisma.transfer.findMany({ where: { organizationId: orgId, id: { in: ids } } });
  const todo = rows.filter((r) => r.status !== "Culled");
  if (!todo.length) throw new HttpError(400, "Tick at least one cow to cull.");
  return withSnapshot(orgId, `Culled ${todo.length} cow${todo.length === 1 ? "" : "s"} (${todo.slice(0, 5).map((r) => r.cowId).join(", ")}${todo.length > 5 ? " ..." : ""})`, async () => {
    for (const r of todo) {
      await prisma.transfer.update({ where: { id: r.id }, data: { status: "Culled" } });
      await logCull(orgId, r.cowId, r.id, r.status);
    }
    return { culled: todo.length };
  });
}

/** New rows go on the end of the list, in the order given. All-or-nothing. */
export async function addTransfers(orgId: string, rows: Record<string, unknown>[]) {
  if (!rows.length) throw new HttpError(400, "Nothing to add.");
  return atomic(async () => {
    const last = await prisma.transfer.findFirst({ where: { organizationId: orgId }, orderBy: { seq: "desc" }, select: { seq: true } });
    let seq = last?.seq ?? 0;
    const data = [];
    // A Cow ID typed as 54 or 968h is the cow already on file as 054 / 968H - but only when exactly one cow fits,
    // so her new transfer takes her off the open list instead of starting a second cow.
    const onFile = new Set([
      ...(await prisma.transfer.findMany({ where: { organizationId: orgId }, select: { cowId: true } })).map((x) => x.cowId),
      ...(await prisma.cowRecord.findMany({ where: { organizationId: orgId }, select: { cowId: true } })).map((x) => x.cowId),
    ]);
    const known = (id: string) => {
      if (onFile.has(id)) return id;
      const lower = [...onFile].filter((x) => x.toLowerCase() === id.toLowerCase());
      if (lower.length === 1) return lower[0];
      if (/^\d+$/.test(id)) {
        const z = [...onFile].filter((x) => /^\d+$/.test(x) && x.replace(/^0+/, "") === id.replace(/^0+/, ""));
        if (z.length === 1) return z[0];
      }
      return id;
    };
    // The same group / owner / grade on 100 lines is checked once.
    const seen = new Map<string, string | null>();
    const check = async (f: TransferField, raw: unknown) => {
      const key = `${f}|${clean(raw).toLowerCase()}`;
      if (f !== "cowId" && seen.has(key)) return seen.get(key)!;
      const v = await checkValue(orgId, f, raw);
      seen.set(key, v);
      return v;
    };
    for (const [i, r] of rows.entries()) {
      const out: Record<string, unknown> = { organizationId: orgId, seq: ++seq };
      for (const f of TRANSFER_FIELDS) {
        if (r[f] === undefined) continue;
        try {
          out[f] = await check(f, r[f]);
        } catch (e) {
          throw new HttpError(400, rows.length > 1 ? `Row ${i + 1}: ${(e as Error).message}` : (e as Error).message);
        }
      }
      if (!out.cowId) throw new HttpError(400, rows.length > 1 ? `Row ${i + 1}: Cow ID can't be blank.` : "Cow ID can't be blank.");
      out.cowId = known(String(out.cowId));
      data.push(out);
    }
    await prisma.transfer.createMany({ data: data as any });
    return { added: data.length };
  });
}

export async function deleteTransfer(orgId: string, id: string) {
  const row = await prisma.transfer.findFirst({ where: { id, organizationId: orgId } });
  if (!row) return;
  await withSnapshot(orgId, `Deleted cow ${row.cowId} (${row.batch || "no group"})`, () => prisma.transfer.delete({ where: { id } }));
}

// ---------------------------------------------------------------------------
// Preg Check
// ---------------------------------------------------------------------------

export async function savePregSettings(orgId: string, s: { pregDate?: unknown; pregBatch?: unknown; pregMinAge?: unknown; pregMaxAge?: unknown }) {
  const data: Record<string, unknown> = {};
  if (s.pregDate !== undefined) {
    const d = clean(s.pregDate);
    if (d && !isYmd(d)) throw new HttpError(400, "Pick a date.");
    data.pregDate = d || null;
  }
  if (s.pregBatch !== undefined) data.pregBatch = clean(s.pregBatch) || null;
  for (const k of ["pregMinAge", "pregMaxAge"] as const) {
    if (s[k] === undefined) continue;
    const n = clean(s[k]);
    if (n && !/^\d+$/.test(n)) throw new HttpError(400, "Age is a number of days.");
    data[k] = n ? Number(n) : null;
  }
  await prisma.organization.update({ where: { id: orgId }, data: data as any });
}

export async function setPregDraft(orgId: string, id: string, result: unknown) {
  const v = clean(result);
  if (v && !(PREG_RESULTS as readonly string[]).includes(v)) throw new HttpError(400, "Result is Probable, Safe or Open.");
  // Picking a result dates the check today; taking it back off (a slip) clears the date with it.
  const n = await prisma.transfer.updateMany({ where: { id, organizationId: orgId }, data: { pregDraft: v || null, pregDraftDate: v ? ranchToday() : null } });
  if (!n.count) throw new HttpError(404, "That record is gone - refresh the page.");
}

/** A different check date for one typed result (checked yesterday, typed in today). */
export async function setPregDraftDate(orgId: string, id: string, date: unknown) {
  const d = clean(date);
  if (d && !isYmd(d)) throw new HttpError(400, "Pick a date.");
  const row = await prisma.transfer.findFirst({ where: { id, organizationId: orgId } });
  if (!row) throw new HttpError(404, "That record is gone - refresh the page.");
  if (!row.pregDraft) throw new HttpError(400, "Pick her Result first - the date goes with it.");
  await prisma.transfer.update({ where: { id }, data: { pregDraftDate: d || ranchToday() } });
}

/** Confirm & Archive: every typed result goes onto its own record and into the Preg Check Archive, all at once. */
export async function confirmPregCheck(orgId: string) {
  const org = await prisma.organization.findUnique({ where: { id: orgId } });
  const rows = await prisma.transfer.findMany({ where: { organizationId: orgId, pregDraft: { not: null } }, orderBy: { seq: "asc" } });
  const todo = rows.filter((r) => r.pregDraft);
  if (!todo.length) throw new HttpError(400, "No results to confirm - fill in the Result column first.");
  // Each result keeps its own check date (set when it was picked); the page Date covers any typed before dates were kept.
  const dateOf = (r: (typeof todo)[number]) => r.pregDraftDate || org?.pregDate || ranchToday();
  const dates = [...new Set(todo.map((r) => dateOf(r)!))].sort();
  return withSnapshot(orgId, `Preg check ${dates.length === 1 ? dates[0] : `${dates[0]} to ${dates[dates.length - 1]}`} (${todo.length} result${todo.length === 1 ? "" : "s"})`, async () => {
    for (const r of todo) {
      await prisma.transfer.update({ where: { id: r.id }, data: { status: r.pregDraft!, pregDraft: null, pregDraftDate: null } });
      await prisma.pregArchive.create({
        data: { organizationId: orgId, checkDate: dateOf(r)!, batch: r.batch, cowId: r.cowId, mating: r.mating, owner: r.owner, result: r.pregDraft!, priorStatus: r.status, transferId: r.id },
      });
    }
    return { confirmed: todo.length };
  });
}

export async function clearPregDrafts(orgId: string) {
  await prisma.transfer.updateMany({ where: { organizationId: orgId, pregDraft: { not: null } }, data: { pregDraft: null, pregDraftDate: null } });
}

// ---------------------------------------------------------------------------
// Master Sheet
// ---------------------------------------------------------------------------

const COW_FIELDS = ["purchaseDate", "loanLocation", "cost", "salePrice", "soldDate", "transactionNo"] as const;
export async function updateCow(orgId: string, cowId: string, field: string, value: unknown) {
  if (!(COW_FIELDS as readonly string[]).includes(field)) throw new HttpError(400, "That column can't be edited.");
  const id = clean(cowId);
  if (!id) throw new HttpError(400, "No cow.");
  let v: string | number | null = clean(value);
  if (field === "cost" || field === "salePrice") {
    const s = v.replace(/[$,\s]/g, "");
    if (s && isNaN(Number(s))) throw new HttpError(400, "Enter a dollar amount.");
    v = s ? Number(s) : null;
  }
  await prisma.cowRecord.upsert({
    where: { organizationId_cowId: { organizationId: orgId, cowId: id } },
    create: { organizationId: orgId, cowId: id, [field]: v } as any,
    update: { [field]: v } as any,
  });
}

// ---------------------------------------------------------------------------
// Lists
// ---------------------------------------------------------------------------

const KINDS: Record<string, { kind: string; field: "owner" | "company" | "grade"; label: string }> = {
  OWNER: { kind: "OWNER", field: "owner", label: "Owner" },
  COMPANY: { kind: "COMPANY", field: "company", label: "Company" },
  GRADE: { kind: "GRADE", field: "grade", label: "Grade" },
};

export async function addBatch(orgId: string, label: unknown, transferDate: unknown) {
  const l = clean(label);
  const d = clean(transferDate);
  if (!l) throw new HttpError(400, "Enter the batch label (e.g. 8-15).");
  if (!isYmd(d)) throw new HttpError(400, "Enter the transfer date for this batch.");
  const dup = await prisma.batch.findFirst({ where: { organizationId: orgId, label: { equals: l, mode: "insensitive" } } });
  if (dup) throw new HttpError(400, `Group "${dup.label}" is already on the list.`);
  const last = await prisma.batch.findFirst({ where: { organizationId: orgId }, orderBy: { order: "desc" } });
  await prisma.batch.create({ data: { organizationId: orgId, label: l, transferDate: d, order: (last?.order ?? 0) + 1 } });
}

/** Renaming a batch or list value renames it on every record that uses it. */
export async function updateBatch(orgId: string, id: string, patch: { label?: unknown; transferDate?: unknown }) {
  const b = await prisma.batch.findFirst({ where: { id, organizationId: orgId } });
  if (!b) throw new HttpError(404, "That group is gone - refresh the page.");
  await atomic(async () => {
    if (patch.transferDate !== undefined) {
      const d = clean(patch.transferDate);
      if (!isYmd(d)) throw new HttpError(400, "Pick a transfer date.");
      await prisma.batch.update({ where: { id }, data: { transferDate: d } });
    }
    if (patch.label !== undefined) {
      const l = clean(patch.label);
      if (!l) throw new HttpError(400, "A group needs a label.");
      if (l !== b.label) {
        const dup = await prisma.batch.findFirst({ where: { organizationId: orgId, label: { equals: l, mode: "insensitive" }, NOT: { id } } });
        if (dup) throw new HttpError(400, `Group "${dup.label}" is already on the list.`);
        await prisma.batch.update({ where: { id }, data: { label: l } });
        await prisma.transfer.updateMany({ where: { organizationId: orgId, batch: b.label }, data: { batch: l } });
        await prisma.pregArchive.updateMany({ where: { organizationId: orgId, batch: b.label }, data: { batch: l } });
      }
    }
  });
}

/** Moves a batch up or down - its place in time decides which record is a cow's latest. */
export async function moveBatch(orgId: string, id: string, dir: number) {
  await atomic(async () => {
    const all = await prisma.batch.findMany({ where: { organizationId: orgId }, orderBy: { order: "asc" } });
    const i = all.findIndex((b) => b.id === id);
    const j = i + (dir < 0 ? -1 : 1);
    if (i < 0 || j < 0 || j >= all.length) return;
    [all[i], all[j]] = [all[j], all[i]];
    for (const [k, b] of all.entries()) if (b.order !== k + 1) await prisma.batch.update({ where: { id: b.id }, data: { order: k + 1 } });
  });
}

export async function deleteBatch(orgId: string, id: string) {
  const b = await prisma.batch.findFirst({ where: { id, organizationId: orgId } });
  if (!b) return;
  const used = await prisma.transfer.count({ where: { organizationId: orgId, batch: b.label } });
  if (used) throw new HttpError(400, `Group ${b.label} is on ${used} record${used === 1 ? "" : "s"} - it can't come off the list.`);
  await prisma.batch.delete({ where: { id } });
}

export async function addListItem(orgId: string, kind: string, value: unknown) {
  const k = KINDS[kind];
  const v = clean(value);
  if (!k) throw new HttpError(400, "Unknown list.");
  if (!v) throw new HttpError(400, `Enter the ${k.label.toLowerCase()}.`);
  const dup = await prisma.listItem.findFirst({ where: { organizationId: orgId, kind, value: { equals: v, mode: "insensitive" } } });
  if (dup) throw new HttpError(400, `${dup.value} is already on the list.`);
  const n = await prisma.listItem.count({ where: { organizationId: orgId, kind } });
  await prisma.listItem.create({ data: { organizationId: orgId, kind, value: v, order: n + 1 } });
}

export async function renameListItem(orgId: string, id: string, value: unknown) {
  const item = await prisma.listItem.findFirst({ where: { id, organizationId: orgId } });
  const v = clean(value);
  if (!item) throw new HttpError(404, "That entry is gone - refresh the page.");
  if (!v) throw new HttpError(400, "It needs a name.");
  if (v === item.value) return;
  const k = KINDS[item.kind];
  await atomic(async () => {
    const dup = await prisma.listItem.findFirst({ where: { organizationId: orgId, kind: item.kind, value: { equals: v, mode: "insensitive" }, NOT: { id } } });
    if (dup) throw new HttpError(400, `${dup.value} is already on the list.`);
    await prisma.listItem.update({ where: { id }, data: { value: v } });
    await prisma.transfer.updateMany({ where: { organizationId: orgId, [k.field]: item.value } as any, data: { [k.field]: v } as any });
    if (k.field === "owner") {
      await prisma.pregArchive.updateMany({ where: { organizationId: orgId, owner: item.value }, data: { owner: v } });
      await prisma.membership.updateMany({ where: { organizationId: orgId, ownerName: item.value }, data: { ownerName: v } });
    }
  });
}

export async function deleteListItem(orgId: string, id: string) {
  const item = await prisma.listItem.findFirst({ where: { id, organizationId: orgId } });
  if (!item) return;
  const k = KINDS[item.kind];
  const used = await prisma.transfer.count({ where: { organizationId: orgId, [k.field]: item.value } as any });
  if (used) throw new HttpError(400, `${item.value} is on ${used} record${used === 1 ? "" : "s"} - it can't come off the list.`);
  await prisma.listItem.delete({ where: { id } });
}

// ---------------------------------------------------------------------------
// Workbook import
// ---------------------------------------------------------------------------

/** Loads a whole Savannah workbook. Replaces what's on the ranch now - a copy is kept first, so Undo brings it back. */
export async function importWorkbook(orgId: string, p: ParsedWorkbook) {
  if (!p.transfers.length) throw new HttpError(400, "The workbook has no transfer rows on its Data tab.");
  return withSnapshot(orgId, `Workbook import (${p.transfers.length} transfers)`, async () => {
    const w = { where: { organizationId: orgId } };
    await prisma.pregArchive.deleteMany(w);
    await prisma.cowEvent.deleteMany(w);
    await prisma.transfer.deleteMany(w);
    await prisma.cowRecord.deleteMany(w);
    await prisma.batch.deleteMany(w);
    await prisma.listItem.deleteMany(w);
    await prisma.batch.createMany({ data: p.batches.map((b, i) => ({ organizationId: orgId, label: b.label, transferDate: b.transferDate, order: i + 1 })) });
    const items = [
      ...p.owners.map((v, i) => ({ organizationId: orgId, kind: "OWNER", value: v, order: i + 1 })),
      ...p.companies.map((v, i) => ({ organizationId: orgId, kind: "COMPANY", value: v, order: i + 1 })),
      ...p.grades.map((v, i) => ({ organizationId: orgId, kind: "GRADE", value: v, order: i + 1 })),
    ];
    if (items.length) await prisma.listItem.createMany({ data: items });
    await prisma.transfer.createMany({
      data: p.transfers.map((t) => ({
        organizationId: orgId,
        seq: t.seq,
        batch: t.batch,
        cowId: t.cowId,
        mating: t.mating,
        owner: t.owner,
        embryoType: t.embryoType,
        grade: t.grade,
        company: t.company,
        status: t.status,
        deliveryStatus: t.deliveryStatus,
        deliveryDate: t.deliveryDate,
        notes: t.notes,
      })),
    });
    if (p.archive.length) await prisma.pregArchive.createMany({ data: p.archive.map((a) => ({ organizationId: orgId, ...a, checkDate: a.checkDate || ranchToday() })) });
    // One Master Sheet line per cow (a second line for the same cow fills only what the first left blank).
    const cows = new Map<string, (typeof p.cows)[number]>();
    for (const c of p.cows) {
      const had = cows.get(c.cowId);
      if (!had) cows.set(c.cowId, { ...c });
      else for (const k of Object.keys(c) as (keyof typeof c)[]) if ((had[k] === "" || had[k] === null) && c[k] !== "" && c[k] !== null) (had as any)[k] = c[k];
    }
    if (cows.size) await prisma.cowRecord.createMany({ data: [...cows.values()].map((c) => ({ organizationId: orgId, ...c })) });
    return { transfers: p.transfers.length, archive: p.archive.length, cows: cows.size };
  });
}

// ---------------------------------------------------------------------------
// Open list (Open Inventory)
// ---------------------------------------------------------------------------

/** Each cow's latest record id ("none" for a cow with no transfers). */
async function latestIds(orgId: string) {
  const { calc } = await loadRanch(orgId);
  return new Map(latestRows(calc).map((c) => [c.cowId, c]));
}
const ids = (raw: unknown) => [...new Set((Array.isArray(raw) ? raw : []).map((x) => clean(x)).filter(Boolean))];
async function event(orgId: string, cowId: string, kind: string, detail = "", transferId: string | null = null) {
  await prisma.cowEvent.create({ data: { organizationId: orgId, cowId, date: ranchToday(), kind, detail, transferId } });
}
async function cowRow(orgId: string, cowId: string, data: Record<string, unknown>) {
  await prisma.cowRecord.upsert({
    where: { organizationId_cowId: { organizationId: orgId, cowId } },
    create: { organizationId: orgId, cowId, ...data } as any,
    update: data as any,
  });
}

/** New cows straight onto the open list (bought / brought in, no transfer yet). */
export async function addOpenCows(orgId: string, raw: unknown, year: number, extra: { purchaseDate?: unknown; loanLocation?: unknown; cost?: unknown; notes?: unknown }) {
  const list = ids(raw);
  if (!list.length) throw new HttpError(400, "Type at least one Cow ID.");
  const costS = clean(extra.cost).replace(/[$,\s]/g, "");
  if (costS && isNaN(Number(costS))) throw new HttpError(400, "Cost is a dollar amount.");
  const latest = await latestIds(orgId);
  const busy = list.filter((id) => {
    const c = latest.get(id);
    // Still waiting on a check (Pending / Probable / blank) - she isn't open yet.
    return c && (!c.status || c.status === "Pending" || c.status === "Probable" || c.status === "Not Recorded");
  });
  if (busy.length) throw new HttpError(400, `Still waiting on a preg check (not open): ${busy.join(", ")}. Nothing was added.`);
  return withSnapshot(orgId, `Added ${list.length} cow${list.length === 1 ? "" : "s"} to ${year} opens`, async () => {
    for (const id of list) {
      const c = latest.get(id);
      const data: Record<string, unknown> = { addedOpen: true, addedYear: year, offListRecord: null, openYear: year, openYearRecord: c ? c.id : "none" };
      if (clean(extra.purchaseDate)) data.purchaseDate = clean(extra.purchaseDate);
      if (clean(extra.loanLocation)) data.loanLocation = clean(extra.loanLocation);
      if (costS) data.cost = Number(costS);
      await cowRow(orgId, id, data);
      await event(orgId, id, "Added to open list", [`${year}`, clean(extra.notes)].filter(Boolean).join(" · "));
    }
    return { added: list.length };
  });
}

/** Red X: off the open list (gone, sold, moved) without culling. A new transfer that comes back Open puts her back. */
export async function takeOffOpen(orgId: string, raw: unknown, why: unknown) {
  const list = ids(raw);
  if (!list.length) throw new HttpError(400, "No cow picked.");
  const latest = await latestIds(orgId);
  return withSnapshot(orgId, `Took ${list.join(", ")} off the open list`, async () => {
    for (const id of list) {
      await cowRow(orgId, id, { offListRecord: latest.get(id)?.id ?? "none" });
      await event(orgId, id, "Taken off open list", clean(why));
    }
    return { off: list.length };
  });
}

/** Move the ticked cows to another year's open list (for her current record). */
export async function moveOpenYear(orgId: string, raw: unknown, year: unknown) {
  const list = ids(raw);
  const y = Number(year);
  if (!list.length) throw new HttpError(400, "Tick at least one cow.");
  if (!Number.isInteger(y) || y < 2000 || y > 2200) throw new HttpError(400, "Pick a year.");
  const latest = await latestIds(orgId);
  return withSnapshot(orgId, `Moved ${list.length} open cow${list.length === 1 ? "" : "s"} to ${y}`, async () => {
    for (const id of list) {
      await cowRow(orgId, id, { openYear: y, openYearRecord: latest.get(id)?.id ?? "none" });
      await event(orgId, id, `Moved to ${y} opens`);
    }
    return { moved: list.length };
  });
}

/** Cull the ticked cows: her latest record turns Culled (a cow with no transfer just leaves the list), dated in her archive. */
export async function cullCows(orgId: string, raw: unknown) {
  const list = ids(raw);
  if (!list.length) throw new HttpError(400, "Tick at least one cow to cull.");
  const latest = await latestIds(orgId);
  return withSnapshot(orgId, `Culled ${list.length} cow${list.length === 1 ? "" : "s"} (${list.slice(0, 5).join(", ")}${list.length > 5 ? " ..." : ""})`, async () => {
    for (const id of list) {
      const c = latest.get(id);
      if (c && (c.status === "Open" || c.status === "Pass")) {
        await prisma.transfer.update({ where: { id: c.id }, data: { status: "Culled" } });
        await logCull(orgId, id, c.id, c.status);
      } else if (c) {
        // Added back to the open list after a Safe / Culled record: that record stays as it was; she leaves the list, culled.
        await cowRow(orgId, id, { offListRecord: c.id });
        await logCull(orgId, id, null, `after ${c.status}`);
      } else {
        await cowRow(orgId, id, { offListRecord: "none" });
        await logCull(orgId, id, null, "");
      }
    }
    return { culled: list.length };
  });
}

/**
 * Preg Check "+ Add cow": a cow that should be on the sheet but isn't (missed at entry, info missing).
 * She goes in as a Pending transfer in that group, so she shows on the list and counts in the totals and percentages.
 */
export async function addPregCow(orgId: string, r: Record<string, unknown>) {
  const cowId = clean(r.cowId);
  const batch = clean(r.batch);
  if (!cowId) throw new HttpError(400, "Enter her Cow ID.");
  if (!batch) throw new HttpError(400, "Pick her Group.");
  const { calc } = await loadRanch(orgId);
  const twin = calc.find((c) => c.latest && c.cowId.toLowerCase() === cowId.toLowerCase() && c.batch.toLowerCase() === batch.toLowerCase() && (!c.status || c.status === "Pending" || c.status === "Probable"));
  if (twin) throw new HttpError(400, `Cow ${twin.cowId} is already on the sheet in group ${twin.batch} - fix her line there instead.`);
  return addTransfers(orgId, [{ batch, cowId, mating: r.mating, owner: r.owner, embryoType: r.embryoType, grade: r.grade, company: r.company, dueOverride: r.dueOverride, notes: r.notes, status: "Pending" }]);
}
