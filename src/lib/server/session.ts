import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export type Role = "OWNER" | "OFFICE" | "MANAGER" | "CUSTOMER";
export type Member = {
  userId: string;
  email: string;
  name: string;
  organizationId: string;
  ranch: string;
  role: Role;
  /** A customer login sees only this owner's cows. */
  ownerName: string | null;
  /** The ranch's service (Admin page): TRIAL, ACTIVE or PAUSED. */
  status: string;
  trialEnds: Date | null;
  /** Paused, or a trial past its end: every login on the ranch can look, nobody can change anything. */
  locked: boolean;
  /** The owner of the first ranch (Carter's own) runs the Admin page: every ranch, its service, new ranches. */
  siteAdmin: boolean;
};

/** The first ranch made - Carter's own. Its owner is the site admin and it is never paused. */
async function firstRanchId(): Promise<string | null> {
  return (await prisma.organization.findFirst({ orderBy: { createdAt: "asc" }, select: { id: true } }))?.id ?? null;
}
export function isLocked(o: { status: string; trialEnds: Date | null }, now = new Date()): boolean {
  return o.status === "PAUSED" || (o.status === "TRIAL" && !!o.trialEnds && o.trialEnds.getTime() < now.getTime());
}

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
    status: m.organization.status,
    trialEnds: m.organization.trialEnds,
    locked: (await firstRanchId()) !== m.organizationId && isLocked(m.organization),
    siteAdmin: m.role === "OWNER" && (await firstRanchId()) === m.organizationId,
  };
}

/** For a page: the logged-in ranch hand (owner / manager). A customer goes to their own page; nobody logged in goes to Login. */
export async function staffPage(): Promise<Member> {
  const m = await load();
  if (!m) redirect("/login");
  if (m.role === "CUSTOMER") redirect("/my");
  return m;
}
/**
 * For a money page (Billing, Master Sheet, Master Archive): the owner, or an Office login (Carter, 2026-10-28 - his wife:
 * billing, money, customer logins). A Manager login goes back to the Dashboard - no access to anything money or
 * customer contact info (Carter, 2026-10-14).
 */
export async function ownerPage(): Promise<Member> {
  const m = await staffPage();
  if (!seesMoney(m)) redirect("/dashboard");
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
  if (m.role === "OFFICE") throw new HttpError(403, "An Office login doesn't change transfers, preg checks or other cattle records - nothing was changed.");
  if (m.role !== "OWNER") throw new HttpError(403, "This login is view only - nothing was changed.");
  if (m.locked) throw new HttpError(403, LOCKED);
  return m;
}
const LOCKED = "This ranch's RecipLive service is paused - your records are all here to look at, but nothing can be changed until it's turned back on. Nothing was changed.";
/** For the Admin page's saves: the site admin only. */
export async function adminApi(): Promise<Member> {
  const m = await load();
  if (!m) throw new HttpError(401, "Please log in again.");
  if (!m.siteAdmin) throw new HttpError(403, "Only the RecipLive admin can do that.");
  return m;
}
/**
 * For a money save - billing and invoices (and the QuickBooks file), owner billing info, cow purchase / cost / sale on the
 * Master Sheet, customer logins: the owner or an Office login (Carter, 2026-10-28).
 */
export async function officeApi(): Promise<Member> {
  const m = await load();
  if (!m) throw new HttpError(401, "Please log in again.");
  if (m.role !== "OWNER" && m.role !== "OFFICE") throw new HttpError(403, "This login is view only - nothing was changed.");
  if (m.locked) throw new HttpError(403, LOCKED);
  return m;
}
/** Owner or Office: sees money and customer contact info. */
export const seesMoney = (m: { role: string }) => m.role === "OWNER" || m.role === "OFFICE";
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
