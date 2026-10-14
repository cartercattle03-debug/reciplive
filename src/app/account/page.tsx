import { ChangePassword, Logins, UndoList } from "@/components/AccountForms";
import { PageHeader, Shell } from "@/components/Shell";
import { prisma } from "@/lib/prisma";
import { loadLists } from "@/lib/server/data";
import { anyPage } from "@/lib/server/session";

export const dynamic = "force-dynamic";

const when = (d: Date | null) => (d ? d.toLocaleString("en-US", { timeZone: "America/Chicago", dateStyle: "medium", timeStyle: "short" }) : "never");

export default async function Account() {
  const m = await anyPage();
  const owner = m.role === "OWNER";
  const [members, lists, snaps] = owner
    ? await Promise.all([
        prisma.membership.findMany({ where: { organizationId: m.organizationId }, include: { user: true }, orderBy: { createdAt: "asc" } }),
        loadLists(m.organizationId),
        prisma.snapshot.findMany({ where: { organizationId: m.organizationId }, orderBy: { createdAt: "desc" }, select: { id: true, label: true, createdAt: true } }),
      ])
    : [[], null, []];
  return (
    <Shell member={m} customer={m.role === "CUSTOMER"}>
      <PageHeader title="Account" sub={`${m.name} · ${m.ranch}`} />
      <div className="flex flex-col gap-5">
        <ChangePassword />
        {owner && lists && (
          <>
            <Logins
              owners={lists.owners}
              logins={members.map((x) => ({ id: x.id, email: x.user.email, name: x.user.name ?? "", role: x.role, ownerName: x.ownerName, lastLogin: when(x.user.lastLoginAt) }))}
            />
            <UndoList snaps={snaps.map((s) => ({ id: s.id, label: s.label, when: when(s.createdAt) }))} />
          </>
        )}
      </div>
    </Shell>
  );
}
