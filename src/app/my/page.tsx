import Link from "next/link";
import { redirect } from "next/navigation";
import { MateSummary, Summary } from "@/components/Breakdowns";
import { StatusKey } from "@/components/StatusKey";
import { MATE_LABELS, MIN_CHECKED, type MateBy } from "@/lib/matings";
import { Checks, PrintButton } from "@/components/Checks";
import { CustomerReport, METRICS } from "@/components/CustomerReport";
import { FilterForm } from "@/components/FilterForm";
import { PageHeader, Shell } from "@/components/Shell";
import { customerParams, type SP } from "@/lib/customerParams";
import { BREAKDOWN_LABELS, CUSTOMER_SORTS, EMBRYO_TYPES, inYear, showDate, type BreakdownBy, type Calc } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { anyPage } from "@/lib/server/session";
import { pickedYear, yearChoices } from "@/lib/server/year";

export const dynamic = "force-dynamic";

// No company comparison on a customer's page (Carter, 2026-10-16: too much risk) - no By Company, no company grids.
const BYS: BreakdownBy[] = ["batch", "embryoType", "grade"];
/** How each of their matings did - and by sire, by donor (Carter, 2026-10-15). */
const MATES: MateBy[] = ["mating", "sire", "donor"];

/**
 * A customer's portal: only their cows, read only - their report and their own breakdowns.
 * The ranch owner can open any owner's portal with ?as=Owner to see exactly what that customer sees.
 */
export default async function MyCows({ searchParams }: { searchParams: SP }) {
  const m = await anyPage();
  const asOwner = typeof searchParams.as === "string" ? searchParams.as : "";
  const preview = (m.role === "OWNER" || m.role === "OFFICE") && !!asOwner;
  if (m.role !== "CUSTOMER" && !preview) redirect("/customer");
  const owner = preview ? asOwner : m.ownerName ?? "";
  const { calc: all, lists, today } = await loadRanch(m.organizationId, { owner: owner || "\u0000none" });
  const year = pickedYear();
  const calc = inYear(all, year);
  // Their list sorts by Transfer Date, then Mating, unless they pick otherwise (Carter, 2026-10-16).
  const { f, show } = customerParams(searchParams, owner, "Transfer Date");
  const myBatches = lists.batches.map((b) => b.label).filter((b) => calc.some((c) => c.batch === b));
  const mate = (MATES as string[]).includes(String(searchParams.by)) ? (searchParams.by as MateBy) : null;
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
  // This page's address with one thing changed - their Sort by, dates, Status and Show picks all stay.
  const keep = (extra: Record<string, string>) => {
    const q = new URLSearchParams();
    for (const [k, v] of Object.entries(searchParams)) for (const x of Array.isArray(v) ? v : v ? [v] : []) q.append(k, x);
    if (preview) q.set("as", owner);
    for (const [k, v] of Object.entries(extra)) q.set(k, v);
    return `/my?${q.toString()}`;
  };
  // A group reads as its transfer date on a customer's page (Carter, 2026-10-16).
  const dateOf = (b: string) => {
    const d = lists.batches.find((x) => x.label === b)?.transferDate;
    return d ? showDate(d) : b;
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
      <CustomerReport
        calc={calc}
        f={f}
        show={show}
        ranch={m.ranch}
        today={today}
        linkCows={false}
        dateOf={dateOf}
        bar={
          <FilterForm className="mb-3 items-start gap-x-6 rounded-lg border-2 border-brand-600 bg-sky-50 p-3 shadow-sm">
          <input type="hidden" name="go" value="1" />
          {preview && <input type="hidden" name="as" value={owner} />}
          <input type="hidden" name="by" value={mate ?? by} />
          <Checks name="sort" label="Sort by" options={[...CUSTOMER_SORTS]} on={[f.sort]} bold one />
          <Checks name="b" label="Transfer Date" options={myBatches} on={f.batches} labels={Object.fromEntries(myBatches.map((b) => [b, dateOf(b)]))} bold />
          <Checks name="s" label="Status" options={["Safe", "Probable", "Pending", "Open"]} on={f.statuses} bold />
          <Checks name="m" label="Show" options={[...METRICS]} on={show} bold />
          </FilterForm>
        }
      />

      <section className="mt-8 break-before-page">
        <h2 className="mb-1 text-lg font-semibold text-slate-900">Your breakdowns</h2>
        <StatusKey className="mb-1" />
        <p className="mb-3 text-sm text-slate-500">Pregnancy rate on your cows only = (Safe + Probable) ÷ (Safe + Probable + Open). Lost after Probable = how many of your cows that were pregnant at the first preg check (Probable) lost it before the final preg check, out of every cow checked Probable - e.g. 1 of 10.</p>
        <div className="no-print mb-4 flex flex-wrap gap-1">
          {BYS.map((b) => (
            <Link key={b} href={keep({ by: b })} scroll={false} className={!mate && b === by ? "btn" : "btn-quiet"}>
              By {b === "batch" ? "Transfer Date" : BREAKDOWN_LABELS[b]}
            </Link>
          ))}
          {MATES.map((b) => (
            <Link key={b} href={keep({ by: b })} scroll={false} className={b === mate ? "btn" : "btn-quiet"}>
              By {MATE_LABELS[b]}
            </Link>
          ))}
        </div>
        {calc.length === 0 ? (
          <p className="text-sm text-slate-500">No transfers in {year} yet.</p>
        ) : mate ? (
          <>
            <MateSummary calc={calc} by={mate} />
            <p className="mb-6 text-xs text-slate-500">
              Every {MATE_LABELS[mate].toLowerCase()} on your transfers this year, most transfers first.{mate !== "mating" ? ` Matings are read as Sire x Donor, so each ${MATE_LABELS[mate].toLowerCase()} adds up across all of its matings.` : ""} The rate shows once {MIN_CHECKED} or more of its cows have been checked - fewer than that is too few to say. Pregnant / Checked = Safe + Probable out of the cows checked so far.
            </p>
          </>
        ) : (
          <>
            <Summary calc={calc} by={by} vals={vals[by]} {...(by === "batch" ? { head: "Transfer Date", show: dateOf } : {})} />
          </>
        )}
      </section>
    </Shell>
  );
}
