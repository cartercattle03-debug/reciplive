import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type Role = "OWNER" | "MANAGER" | "CUSTOMER";
export type Member = {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  ranch: string;
  role: Role;
  /** A customer login sees only this owner's cows. */
  ownerName: string | null;
};

async function load(): Promise<Member | null> {
  const s = await getServerSession(authOptions);
  const id = (s?.user as { id?: string } | undefined)?.id;
  if (!id) return null;
  const m = await prisma.membership.findFirst({ where: { userId: id }, include: { user: true, organization: true }, orderBy: { createdAt: "asc" } });
  if (!m) return null;
  return {
    userId: id,
    email: m.user.email,
    name: m.user.name || m.user.email,
    organizationId: m.organizationId,
    ranch: m.organization.name,
    role: (m.role as Role) || "OWNER",
    ownerName: m.ownerName,
  };
}

/** For a page: the logged-in ranch hand (owner / manager). A customer goes to their own page; nobody logged in goes to Login. */
export async function staffPage(): Promise<Member> {
  const m = await load();
  if (!m) redirect("/login");
  if (m.role === "CUSTOMER") redirect("/my");
  return m;
}
export async function anyPage(): Promise<Member> {
  const m = await load();
  if (!m) redirect("/login");
  return m;
}

export class HttpError extends Error {
  constructor(public status: number, msg: string) {
    super(msg);
  }
}
/**
 * For a save: the ranch owner only. A Manager login is view only (Carter, 2026-10-14: no changes, no downloads)
 * and a customer only ever reads their own cows. The second argument is kept for older callers.
 */
export async function staffApi(_ownerOnly = false): Promise<Member> {
  const m = await load();
  if (!m) throw new HttpError(401, "Please log in again.");
  if (m.role !== "OWNER") throw new HttpError(403, "This login is view only - nothing was changed.");
  return m;
}
/** True for a login that can only look (Manager). */
export const viewOnly = (m: Member) => m.role !== "OWNER";

/** Wraps an API handler: errors come back as { error } with the right status, never a crash page. */
export function handle(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request) => {
    try {
      const out = await fn(req);
      return Response.json(out ?? { ok: true });
    } catch (e) {
      if (e instanceof HttpError) return Response.json({ error: e.message }, { status: e.status });
      console.error(e);
      return Response.json({ error: e instanceof Error ? e.message : "Something went wrong - nothing was saved." }, { status: 500 });
    }
  };
}
