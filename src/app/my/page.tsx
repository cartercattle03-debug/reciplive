import Link from "next/link";
import { redirect } from "next/navigation";
import { Grid, Summary } from "@/components/Breakdowns";
import { Checks, PrintButton } from "@/components/Checks";
import { CustomerReport, METRICS } from "@/components/CustomerReport";
import { FilterForm, Pick } from "@/components/FilterForm";
import { PageHeader, Shell } from "@/components/Shell";
import { customerParams, type SP } from "@/lib/customerParams";
import { BREAKDOWN_LABELS, EMBRYO_TYPES, inYear, type BreakdownBy, type Calc } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { anyPage } from "@/lib/server/session";
import { pickedYear, yearChoices } from "@/lib/server/year";

export const dynamic = "force-dynamic";

const BYS: BreakdownBy[] = ["batch", "embryoType", "company", "grade"];

/**
 * A customer's portal: only their cows, read only - their report and their own breakdowns.
 * The ranch owner can open any owner's portal with ?as=Owner to see exactly what that customer sees.
 */
export default async function MyCows({ searchParams }: { searchParams: SP }) {
  const m = await anyPage();
  const asOwner = typeof searchParams.as === "string" ? searchParams.as : "";
  const preview = m.role === "OWNER" && !!asOwner;
  if (m.role !== "CUSTOMER" && !preview) redirect("/customer");
  const owner = preview ? asOwner : m.ownerName ?? "";
  const { calc: all, lists, today } = await loadRanch(m.organizationId, { owner: owner || "\u0000none" });
  const year = pickedYear();
  const calc = inYear(all, year);
  const { f, show } = customerParams(searchParams, owner);
  const myBatches = lists.batches.map((b) => b.label).filter((b) => calc.some((c) => c.batch === b));
  const by = (BYS as string[]).includes(String(searchParams.by)) ? (searchParams.by as BreakdownBy) : "batch";
  // Only what is on their own cows, in the Lists order.
  const theirs = (field: BreakdownBy, list: string[]) => list.filter((v) => calc.some((c: Calc) => c[field].toLowerCase() === v.toLowerCase()));
  const vals: Record<BreakdownBy, string[]> = {
    batch: myBatches,
    owner: [owner],
    company: theirs("company", lists.companies),
    grade: theirs("grade", lists.grades),
    embryoType: theirs("embryoType", [...EMBRYO_TYPES]),
  };
  const keep = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    if (preview) q.set("as", owner);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `/my?${q.toString()}`;
  };
  const yearsWithCows = [...new Set(all.map((c) => Number(c.transferDate?.slice(0, 4))).filter(Boolean))];
  return (
    <Shell member={m} customer year={{ year, years: yearChoices({ ...lists, batches: [] }, [year, ...yearsWithCows]).filter((y) => y <= Math.max(year, ...yearsWithCows)) }}>
      {preview && (
        <div className="no-print mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>Preview:</b> this is exactly what {owner}&apos;s login sees. Nothing here can be changed.
          <Link href={`/customer?owner=${encodeURIComponent(owner)}`} className="ml-auto font-semibold underline">
            Back to Customer Search
          </Link>
        </div>
      )}
      <PageHeader title={`${owner} - your recips (${year})`} sub={`Your cows at ${m.ranch}, live as results are recorded. Pick another year in the Year box at the top.`}>
        <PrintButton />
      </PageHeader>
      <FilterForm className="card items-start p-3">
        <input type="hidden" name="go" value="1" />
        {preview && <input type="hidden" name="as" value={owner} />}
        <input type="hidden" name="by" value={by} />
        <Pick name="sort" label="Sort By" value={f.sort} options={["Cow ID", "Mating"]} all={null} />
        <Checks name="b" label="Batch" options={myBatches} on={f.batches} />
        <Checks name="s" label="Status" options={["Safe", "Probable", "Pending", "Open"]} on={f.statuses} />
        <Checks name="m" label="Show" options={[...METRICS]} on={show} />
      </FilterForm>
      <CustomerReport calc={calc} f={f} show={show} ranch={m.ranch} today={today} linkCows={false} />

      <section className="mt-8 break-before-page">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Your breakdowns</h2>
        <p className="mb-3 text-sm text-slate-500">Pregnancy rate on your cows only = (Safe + Probable) ÷ (Safe + Open + Probable). In the grids each cell shows the rate and Safe+Probable / checked; yellow = some are still Probable.</p>
        <div className="no-print mb-4 flex flex-wrap gap-1">
          {BYS.map((b) => (
            <Link key={b} href={keep({ by: b })} className={b === by ? "btn" : "btn-quiet"}>
              By {BREAKDOWN_LABELS[b]}
            </Link>
          ))}
        </div>
        {calc.length === 0 ? (
          <p className="text-sm text-slate-500">No transfers in {year} yet.</p>
        ) : (
          <>
            <Summary calc={calc} by={by} vals={vals[by]} />
            {by === "batch" && EMBRYO_TYPES.map((t) => <Grid key={t} title={`${t} - pregnancy rate by group and company`} calc={calc} rowBy="batch" rows={vals.batch} colBy="company" cols={vals.company} type={t} />)}
            {by === "company" && EMBRYO_TYPES.map((t) => <Grid key={t} title={`${t} - pregnancy rate by company and group`} calc={calc} rowBy="company" rows={vals.company} colBy="batch" cols={vals.batch} type={t} />)}
            {by === "grade" && <Grid title="Pregnancy rate by grade and company" calc={calc} rowBy="grade" rows={vals.grade} colBy="company" cols={vals.company} />}
          </>
        )}
      </section>
    </Shell>
  );
}
