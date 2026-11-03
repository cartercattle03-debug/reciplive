import { createHash, randomBytes } from "node:crypto";
import { prisma } from "@/lib/prisma";

const hash = (t: string) => createHash("sha256").update(t).digest("hex");
export const INVITE_DAYS = 14;

/** A fresh set-your-password link for a ranch's owner. Any earlier unused link for that ranch stops working. */
export async function makeInvite(organizationId: string, email: string, origin: string): Promise<string> {
  await prisma.ranchInvite.updateMany({ where: { organizationId, usedAt: null }, data: { expiresAt: new Date() } });
  const token = randomBytes(24).toString("base64url");
  await prisma.ranchInvite.create({ data: { organizationId, email, tokenHash: hash(token), expiresAt: new Date(Date.now() + INVITE_DAYS * 86400_000) } });
  return `${origin.replace(/\/$/, "")}/join/${token}`;
}

/** The invite behind a link, if it still works. */
export async function findInvite(token: string) {
  const inv = await prisma.ranchInvite.findUnique({ where: { tokenHash: hash(token) }, include: { organization: { select: { name: true } } } });
  return inv && !inv.usedAt && inv.expiresAt.getTime() > Date.now() ? inv : null;
}
