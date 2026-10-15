import Link from "next/link";
import { PageHeader } from "@/components/Shell";
import { Grid, Summary } from "@/components/Breakdowns";
import { BREAKDOWN_LABELS, EMBRYO_TYPES, inYear, type BreakdownBy } from "@/lib/recip";
import { pickedYear } from "@/lib/server/year";
import { loadRanch, type Lists } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

const ORDER: BreakdownBy[] = ["batch", "owner", "company", "embryoType", "grade"];

function values(by: BreakdownBy, l: Lists, year: number): string[] {
  if (by === "batch") return l.batches.filter((b) => b.transferDate?.startsWith(String(year))).map((b) => b.label);
  if (by === "owner") return l.owners;
  if (by === "company") return l.companies;
  if (by === "grade") return l.grades;
  return [...EMBRYO_TYPES];
}

export default async function Breakdowns({ searchParams }: { searchParams: { by?: string } }) {
  const m = await staffPage();
  const { calc: all, lists } = await loadRanch(m.organizationId);
  const year = pickedYear();
  const calc = inYear(all, year);
  const by = (ORDER as string[]).includes(searchParams.by ?? "") ? (searchParams.by as BreakdownBy) : "batch";
  const v = (b: BreakdownBy) => values(b, lists, year);
  return (
    <div>
      <PageHeader title={`${BREAKDOWN_LABELS[by]} breakdown - ${year}`} sub="New groups, owners, companies and grades show up here as soon as they're on the Lists page. In the grids each cell shows the pregnancy rate and Safe+Probable / checked; yellow = some are still Probable (not confirmed). Lost after Probable = how many cows checked Probable lost the pregnancy (Open or culled) before 75 days, out of every cow checked Probable - e.g. 1 of 10." />
      <div className="no-print mb-4 flex flex-wrap gap-1">
        {ORDER.map((b) => (
          <Link key={b} href={`/breakdowns?by=${b}`} className={b === by ? "btn" : "btn-quiet"}>
            By {BREAKDOWN_LABELS[b]}
          </Link>
        ))}
      </div>
      <Summary calc={calc} by={by} vals={v(by)} />
      {by === "owner" && EMBRYO_TYPES.map((t) => <Grid key={t} title={`${t} - pregnancy rate by owner and company`} calc={calc} rowBy="owner" rows={v("owner")} colBy="company" cols={v("company")} type={t} />)}
      {by === "company" && EMBRYO_TYPES.map((t) => <Grid key={t} title={`${t} - pregnancy rate by company and group`} calc={calc} rowBy="company" rows={v("company")} colBy="batch" cols={v("batch")} type={t} />)}
      {by === "grade" && (
        <>
          {EMBRYO_TYPES.map((t) => <Grid key={t} title={`${t} - pregnancy rate by grade and company`} calc={calc} rowBy="grade" rows={v("grade")} colBy="company" cols={v("company")} type={t} />)}
          <Grid title="All embryo types - grade by company" calc={calc} rowBy="grade" rows={v("grade")} colBy="company" cols={v("company")} />
        </>
      )}
      {by === "batch" && EMBRYO_TYPES.map((t) => <Grid key={t} title={`${t} - pregnancy rate by group and company`} calc={calc} rowBy="batch" rows={v("batch")} colBy="company" cols={v("company")} type={t} />)}
    </div>
  );
}
