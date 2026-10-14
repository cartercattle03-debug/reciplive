import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { handle, HttpError, staffApi } from "@/lib/server/session";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

export const POST = handle(async (req) => {
  const b = await req.json();
  // Anyone logged in (customers too) can change their own password.
  if (b.action === "password") {
    const s = await getServerSession(authOptions);
    const id = (s?.user as { id?: string } | undefined)?.id;
    if (!id) throw new HttpError(401, "Please log in again.");
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user || !(await bcrypt.compare(String(b.current ?? ""), user.passwordHash))) throw new HttpError(400, "Current password isn't right.");
    if (String(b.next ?? "").length < 8) throw new HttpError(400, "New password needs at least 8 characters.");
    await prisma.user.update({ where: { id }, data: { passwordHash: await bcrypt.hash(String(b.next), 10) } });
    return { ok: true };
  }
  const m = await staffApi(true);
  if (b.action === "addLogin") {
    const email = String(b.email ?? "").trim().toLowerCase();
    const role = b.role === "MANAGER" ? "MANAGER" : "CUSTOMER";
    const ownerName = String(b.ownerName ?? "").trim();
    const password = String(b.password ?? "");
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new HttpError(400, "Enter a good email address.");
    if (password.length < 8) throw new HttpError(400, "Starting password needs at least 8 characters.");
    if (role === "CUSTOMER") {
      const owner = await prisma.listItem.findFirst({ where: { organizationId: m.organizationId, kind: "OWNER", value: ownerName } });
      if (!owner) throw new HttpError(400, "Pick which owner this customer is.");
    }
    if (await prisma.user.findUnique({ where: { email } })) throw new HttpError(400, "That email already has a login.");
    await prisma.$transaction(async (tx) => {
      const user = await tx.user.create({ data: { email, name: String(b.name ?? "").trim() || null, passwordHash: await bcrypt.hash(password, 10) } });
      await tx.membership.create({ data: { userId: user.id, organizationId: m.organizationId, role, ownerName: role === "CUSTOMER" ? ownerName : null } });
    });
    return { ok: true };
  }
  if (b.action === "resetPassword" || b.action === "removeLogin") {
    const mem = await prisma.membership.findFirst({ where: { id: String(b.id), organizationId: m.organizationId } });
    if (!mem || mem.role === "OWNER") throw new HttpError(400, "That login can't be changed here.");
    if (b.action === "removeLogin") {
      await prisma.user.delete({ where: { id: mem.userId } });
      return { ok: true };
    }
    if (String(b.password ?? "").length < 8) throw new HttpError(400, "Password needs at least 8 characters.");
    await prisma.user.update({ where: { id: mem.userId }, data: { passwordHash: await bcrypt.hash(String(b.password), 10) } });
    return { ok: true };
  }
  throw new HttpError(400, "Unknown step.");
});
