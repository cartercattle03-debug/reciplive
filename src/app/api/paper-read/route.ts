import { prisma } from "@/lib/prisma";
import { handle, HttpError, staffApi } from "@/lib/server/session";
import { readSheet } from "@/lib/server/paperReader";
import { PAPER_MONTHLY } from "@/lib/paper";
import { pagesThisMonth } from "@/lib/server/paperCount";

export const runtime = "nodejs";
export const maxDuration = 300;

const TYPES = ["image/jpeg", "image/png", "image/webp", "image/gif", "application/pdf"];

/**
 * Read one paper page (Carter, 2026-11-18). Owner only, like every other change. Nothing is saved but the page count:
 * the rows go back to the screen for review. Body: { data: base64, type, kind: "transfer" | "preg" }.
 */
export const POST = handle(async (req) => {
  const m = await staffApi();
  const b = (await req.json().catch(() => null)) as { data?: string; type?: string; kind?: string } | null;
  const data = String(b?.data ?? "").replace(/^data:[^,]*,/, "");
  const type = String(b?.type ?? "");
  const kind = b?.kind === "preg" ? "preg" : "transfer";
  if (!data || !TYPES.includes(type)) throw new HttpError(400, "Send a photo (JPG or PNG) or a PDF of the page.");
  if (data.length > 4_200_000) throw new HttpError(400, "That file is too big to read in one go - for a long PDF, send its pages as photos.");
  if (!m.siteAdmin && (await pagesThisMonth(m.organizationId)) >= PAPER_MONTHLY)
    throw new HttpError(402, `This ranch has read its ${PAPER_MONTHLY} paper pages for the month - more on the 1st.`);
  let r;
  try {
    r = await readSheet({ data, type }, kind);
  } catch (e) {
    throw new HttpError(400, (e as Error).message);
  }
  await prisma.paperRead.create({ data: { organizationId: m.organizationId, kind, title: r.page.title || null, rows: r.page.rows.length, cents: r.cents } });
  return { page: r.page, used: await pagesThisMonth(m.organizationId), cap: m.siteAdmin ? null : PAPER_MONTHLY };
});
