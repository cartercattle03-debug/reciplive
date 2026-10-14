import { Checks, PrintButton } from "@/components/Checks";
import { CustomerReport, METRICS } from "@/components/CustomerReport";
import { FilterForm, Pick } from "@/components/FilterForm";
import { PageHeader, Shell } from "@/components/Shell";
import { customerParams, type SP } from "@/lib/customerParams";
import { loadRanch } from "@/lib/server/data";
import { anyPage } from "@/lib/server/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/** A customer login's own page: only their cows, read-only. */
export default async function MyCows({ searchParams }: { searchParams: SP }) {
  const m = await anyPage();
  if (m.role !== "CUSTOMER") redirect("/customer");
  const owner = m.ownerName ?? "";
  const { calc, lists, today } = await loadRanch(m.organizationId, { owner: owner || "\u0000none" });
  const { f, show } = customerParams(searchParams, owner);
  const myBatches = lists.batches.map((b) => b.label).filter((b) => calc.some((c) => c.batch === b));
  return (
    <Shell member={m} customer>
      <PageHeader title={`${owner} - your recips`} sub={`Your cows at ${m.ranch}, live as results are recorded.`}>
        <PrintButton />
      </PageHeader>
      <FilterForm className="card items-start p-3">
        <input type="hidden" name="go" value="1" />
        <Pick name="sort" label="Sort By" value={f.sort} options={["Cow ID", "Mating"]} all={null} />
        <Checks name="b" label="Batch" options={myBatches} on={f.batches} />
        <Checks name="s" label="Status" options={["Safe", "Probable", "Pending", "Open"]} on={f.statuses} />
        <Checks name="m" label="Show" options={[...METRICS]} on={show} />
      </FilterForm>
      <CustomerReport calc={calc} f={f} show={show} ranch={m.ranch} today={today} linkCows={false} />
    </Shell>
  );
}
