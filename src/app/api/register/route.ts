import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { handle, HttpError } from "@/lib/server/session";

/** Makes the ranch and its owner login. Open only until the first ranch exists, unless ALLOW_SIGNUP=1. */
export const POST = handle(async (req) => {
  const b = await req.json();
  const email = String(b.email ?? "").trim().toLowerCase();
  const password = String(b.password ?? "");
  const ranch = String(b.ranch ?? "").trim();
  const name = String(b.name ?? "").trim();
  if (process.env.ALLOW_SIGNUP !== "1" && (await prisma.organization.count()) > 0) throw new HttpError(403, "Sign-up is closed. Ask the ranch owner for a login.");
  if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Enter a good email address.");
  if (password.length < 8) throw new HttpError(400, "Password needs at least 8 characters.");
  if (!ranch) throw new HttpError(400, "Enter the ranch name.");
  if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(400, "That email already has a login.");
  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction(async (tx) => {
    const org = await tx.organization.create({ data: { name: ranch } });
    const user = await tx.user.create({ data: { email, name: name || null, passwordHash } });
    await tx.membership.create({ data: { userId: user.id, organizationId: org.id, role: "OWNER" } });
  });
  return { ok: true };
});
