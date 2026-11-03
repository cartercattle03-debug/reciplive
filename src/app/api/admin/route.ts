import { prisma } from "@/lib/prisma";
import { adminApi, handle, HttpError } from "@/lib/server/session";
import { makeInvite } from "@/lib/server/invites";

const STATUSES = ["TRIAL", "ACTIVE", "PAUSED"];
const day = (v: unknown): Date | null => {
  const t = String(v ?? "").trim();
  if (!t) return null;
  const d = new Date(`${t}T12:00:00Z`);
  if (isNaN(d.getTime())) throw new HttpError(400, `"${t}" isn't a date.`);
  return d;
};

/**
 * Admin page (Carter, 2026-11-03): make a new ranch (a blank slate) with a set-your-password link for its owner, set a
 * ranch's service - Testing until a date, Active (paid through a date) or Paused - and make a new owner link.
 * Only the site admin (the first ranch's owner). Nothing here reads or changes a ranch's cattle records.
 */
export const POST = handle(async (req) => {
  const me = await adminApi();
  const b = await req.json();
  const origin = new URL(req.url).origin;
  if (b.action === "create") {
    const name = String(b.name ?? "").trim();
    const email = String(b.email ?? "").trim().toLowerCase();
    if (!name) throw new HttpError(400, "Enter the ranch name.");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Enter the owner's email address.");
    if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(400, "That email already has a RecipLive login - the new ranch needs its own owner email.");
    const days = Math.max(1, Math.min(365, Number(b.trialDays) || 30));
    const org = await prisma.organization.create({ data: { name, status: "TRIAL", trialEnds: new Date(Date.now() + days * 86400_000), adminNote: String(b.note ?? "").trim() || null } });
    return { ok: true, link: await makeInvite(org.id, email, origin), email };
  }
  const org = await prisma.organization.findUnique({ where: { id: String(b.id ?? "") } });
  if (!org) throw new HttpError(404, "That ranch wasn't found - reload the page.");
  if (b.action === "update") {
    const status = String(b.status ?? "");
    if (!STATUSES.includes(status)) throw new HttpError(400, "Pick Testing, Active or Paused.");
    if (org.id === me.organizationId && status !== "ACTIVE") throw new HttpError(400, "Your own ranch always stays Active.");
    const trialEnds = day(b.trialEnds);
    if (status === "TRIAL" && !trialEnds) throw new HttpError(400, "Testing needs an end date.");
    await prisma.organization.update({ where: { id: org.id }, data: { status, trialEnds, paidThrough: day(b.paidThrough), adminNote: String(b.note ?? "").trim() || null } });
    return { ok: true };
  }
  if (b.action === "invite") {
    const owner = await prisma.membership.findFirst({ where: { organizationId: org.id, role: "OWNER" } });
    if (owner) throw new HttpError(400, "That ranch's owner has already set up their login.");
    const last = await prisma.ranchInvite.findFirst({ where: { organizationId: org.id }, orderBy: { createdAt: "desc" } });
    const email = String(b.email ?? last?.email ?? "").trim().toLowerCase();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Enter the owner's email address.");
    if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(400, "That email already has a RecipLive login.");
    return { ok: true, link: await makeInvite(org.id, email, origin), email };
  }
  throw new HttpError(400, "Unknown step.");
});
