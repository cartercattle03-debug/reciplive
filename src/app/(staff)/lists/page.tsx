import { BatchList, ItemList } from "@/components/ListsEditor";
import { PageHeader } from "@/components/Shell";
import { prisma } from "@/lib/prisma";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function Lists() {
  const m = await staffPage();
  const { calc } = await loadRanch(m.organizationId);
  const items = await prisma.listItem.findMany({ where: { organizationId: m.organizationId }, orderBy: { order: "asc" } });
  const batches = await prisma.batch.findMany({ where: { organizationId: m.organizationId }, orderBy: { order: "asc" } });
  const uses = (field: "batch" | "owner" | "company" | "grade", v: string) => calc.filter((c) => c[field] === v).length;
  const of = (kind: string, field: "owner" | "company" | "grade") => items.filter((i) => i.kind === kind).map((i) => ({ id: i.id, value: i.value, uses: uses(field, i.value) }));
  return (
    <div>
      <PageHeader title="Lists" sub="The choices on every page. A new group, owner, company or grade shows up on every breakdown and report as soon as it's added. Renaming one renames it on every record. Embryo Type (Fresh / Frozen) and Status are fixed." />
      <div className="grid gap-5 lg:grid-cols-2 xl:grid-cols-4">
        <div className="lg:col-span-2">
          <BatchList batches={batches.map((b) => ({ id: b.id, label: b.label, transferDate: b.transferDate, uses: uses("batch", b.label) }))} />
        </div>
        <div className="lg:col-span-2">
          <ItemList kind="OWNER" title="Owners" billing items={items.filter((i) => i.kind === "OWNER").map((i) => ({ id: i.id, value: i.value, uses: uses("owner", i.value), ranchName: i.ranchName, location: i.location, email: i.email }))} />
        </div>
        <div className="flex flex-col gap-5">
          <ItemList kind="COMPANY" title="Companies" items={of("COMPANY", "company")} />
          <ItemList kind="GRADE" title="Grades" items={of("GRADE", "grade")} />
        </div>
      </div>
    </div>
  );
}
