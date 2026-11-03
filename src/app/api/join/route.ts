import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/server/session";
import { findInvite } from "@/lib/server/invites";

/** A new ranch's owner sets their name and password from the link on the Admin page; the link then stops working. */
export const POST = handle(async (req) => {
  const b = await req.json();
  const inv = await findInvite(String(b.token ?? ""));
  if (!inv) throw new HttpError(400, "This link has expired or was already used. Ask for a new one.");
  const password = String(b.password ?? "");
  if (password.length < 8) throw new HttpError(400, "Password needs at least 8 characters.");
  if (await prisma.user.findUnique({ where: { email: inv.email } })) throw new HttpError(400, "That email already has a RecipLive login - sign in instead.");
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction(async (tx) => {
    const user = await tx.user.create({ data: { email: inv.email, name: String(b.name ?? "").trim() || null, passwordHash } });
    await tx.membership.create({ data: { userId: user.id, organizationId: inv.organizationId, role: "OWNER" } });
    await tx.ranchInvite.update({ where: { id: inv.id }, data: { usedAt: new Date() } });
  });
  return { ok: true, email: inv.email };
});
