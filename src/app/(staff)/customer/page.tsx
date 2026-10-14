import { Checks, PrintButton } from "@/components/Checks";
import { CustomerReport, METRICS } from "@/components/CustomerReport";
import { FilterForm, Pick } from "@/components/FilterForm";
import { PageHeader } from "@/components/Shell";
import { customerParams, type SP } from "@/lib/customerParams";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function CustomerSearch({ searchParams }: { searchParams: SP }) {
  const m = await staffPage();
  const { calc, lists, today } = await loadRanch(m.organizationId);
  const owner = typeof searchParams.owner === "string" ? searchParams.owner : "";
  const { f, show } = customerParams(searchParams, owner);
  return (
    <div>
      <PageHeader title="Customer Search" sub="Pick an owner, narrow by batch and status if you like (none ticked = all), choose which numbers to show, then print or save as PDF for that customer.">
        {owner && <PrintButton />}
      </PageHeader>
      <FilterForm className="card items-start p-3">
        <input type="hidden" name="go" value="1" />
        <Pick name="owner" label="Owner" value={owner} options={lists.owners} all="Pick an owner" />
        <Pick name="sort" label="Sort By" value={f.sort} options={["Cow ID", "Mating"]} all={null} />
        <Checks name="b" label="Batch" options={lists.batches.map((b) => b.label)} on={f.batches} />
        <Checks name="s" label="Status" options={["Safe", "Probable", "Pending", "Open"]} on={f.statuses} />
        <Checks name="m" label="Show on the report" options={[...METRICS]} on={show} />
      </FilterForm>
      {owner ? <CustomerReport calc={calc} f={f} show={show} ranch={m.ranch} today={today} /> : <p className="text-sm text-slate-600">Pick an owner to see their cows.</p>}
    </div>
  );
}
