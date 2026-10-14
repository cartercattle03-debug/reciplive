import { importWorkbook } from "@/lib/server/records";
import { handle, HttpError, staffApi } from "@/lib/server/session";
import { parseWorkbook } from "@/lib/workbook";
import { prisma } from "@/lib/prisma";

export const maxDuration = 120;

/** Preview first (what will come in, what was cleaned up), then Load. */
export const POST = handle(async (req) => {
  const m = await staffApi();
  const b = await req.json();
  if (!b.workbook || typeof b.workbook !== "object") throw new HttpError(400, "No workbook came through - pick the file again.");
  let parsed;
  try {
    parsed = parseWorkbook(b.workbook);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  if (b.action === "preview") {
    const now = await prisma.transfer.count({ where: { organizationId: m.organizationId } });
    const cows = new Set(parsed.transfers.map((t) => t.cowId)).size;
    return {
      transfers: parsed.transfers.length,
      cows,
      batches: parsed.batches.map((b) => `${b.label}${b.transferDate ? "" : " (no date)"}`),
      owners: parsed.owners.length,
      companies: parsed.companies,
      grades: parsed.grades,
      archive: parsed.archive.length,
      master: parsed.cows.length,
      fixes: parsed.fixes,
      warnings: parsed.warnings,
      replacing: now,
    };
  }
  if (b.action === "load") return importWorkbook(m.organizationId, parsed);
  throw new HttpError(400, "Unknown step.");
});
