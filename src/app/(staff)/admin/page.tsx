import { redirect } from "next/navigation";
import { PageHeader } from "@/components/Shell";
import { AdminRanches, type RanchRow } from "@/components/AdminRanches";
import { prisma } from "@/lib/prisma";
import { isLocked, staffPage } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const iso = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : "");
const when = (d: Date | null) => (d ? d.toLocaleDateString("en-US", { timeZone: "America/Chicago" }) : "");

/**
 * Admin (Carter, 2026-11-03): every ranch on RecipLive - its owner, service (Testing / Active / Paused), last sign-in and
 * how much is on file - and + New ranch for a producer's blank slate. Counts only; a ranch's cows stay private.
 */
export default async function Admin() {
  const m = await staffPage();
  if (!m.siteAdmin) redirect("/dashboard");
  const orgs = await prisma.organization.findMany({
    orderBy: { createdAt: "asc" },
    include: {
      memberships: { include: { user: { select: { email: true, name: true, lastLoginAt: true } } } },
      invites: { orderBy: { createdAt: "desc" }, take: 1 },
      _count: { select: { transfers: true, cows: true, invoices: true } },
    },
  });
  const rows: RanchRow[] = orgs.map((o) => {
    const owner = o.memberships.find((x) => x.role === "OWNER");
    const last = o.memberships.map((x) => x.user.lastLoginAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0] ?? null;
    return {
      id: o.id,
      name: o.name,
      own: o.id === m.organizationId,
      owner: owner ? owner.user.email : "",
      ownerName: owner?.user.name ?? "",
      invited: !owner && o.invites[0] ? o.invites[0].email : "",
      inviteOpen: !owner && !!o.invites[0] && !o.invites[0].usedAt && o.invites[0].expiresAt.getTime() > Date.now(),
      status: o.status,
      trialEnds: iso(o.trialEnds),
      paidThrough: iso(o.paidThrough),
      note: o.adminNote ?? "",
      locked: o.id !== m.organizationId && isLocked(o),
      created: when(o.createdAt),
      lastLogin: when(last),
      logins: o.memberships.length,
      transfers: o._count.transfers,
      cows: o._count.cows,
      invoices: o._count.invoices,
    };
  });
  return (
    <div>
      <PageHeader
        title="Admin"
        sub="Every ranch on RecipLive. + New ranch makes a blank slate for a producer and a link for its owner to set their own password - send it to them by text or email. Testing runs until its end date; Paused, or a test past its end, turns the ranch view only: every record is kept, nothing can be changed. Only counts show here - a ranch's cows stay private."
      />
      <AdminRanches rows={rows} />
    </div>
  );
}
