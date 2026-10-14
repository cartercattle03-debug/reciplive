import Link from "next/link";
import { BillingSettingsForm } from "@/components/BillingForms";
import { FilterForm, Pick } from "@/components/FilterForm";
import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { cowCell, dateCell, money, numCell } from "@/lib/cells";
import { billable } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { compareFamily, showDate } from "@/lib/recip";
import { billedIds, billingSettings } from "@/lib/server/billing";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function Billing({ searchParams }: { searchParams: { owner?: string } }) {
  const m = await staffPage();
  const [{ calc, archive, lists }, set, billed, invoices] = await Promise.all([
    loadRanch(m.organizationId),
    billingSettings(m.organizationId),
    billedIds(m.organizationId),
    prisma.invoice.findMany({ where: { organizationId: m.organizationId }, include: { lines: true }, orderBy: { number: "desc" } }),
  ]);
  const owner = searchParams.owner ?? "";
  const ready = billable(calc, archive, billed)
    .filter((l) => !owner || l.owner === owner)
    .sort((a, b) => a.owner.localeCompare(b.owner) || compareFamily(a.cowId, b.cowId));
  const owners = [...new Set(billable(calc, archive, billed).map((l) => l.owner))].sort();
  const rows: Row[] = ready.map((l) => ({
    key: l.transferId,
    cells: [
      { t: "", pick: l.transferId },
      { t: l.owner, cls: "font-semibold" },
      dateCell(l.transferDate),
      cowCell(l.cowId),
      { t: l.mating },
      dateCell(l.dueDate),
      { ...dateCell(l.confirmedDate), cls: l.confirmedDate ? "" : "text-slate-400", t: l.confirmedDate ? showDate(l.confirmedDate) : "not on file" },
      numCell(l.daysPreg),
      { t: l.batch, cls: "grp" },
    ],
  }));
  const invRows: Row[] = invoices.map((i) => {
    const total = i.lines.reduce((s, l) => s + l.amount, 0);
    return {
      key: i.id,
      cls: i.status === "Void" ? "opacity-60" : "",
      cells: [
        { t: `#${i.number}`, s: i.number, href: `/billing/${i.id}` },
        { t: i.billTo, cls: "font-semibold" },
        dateCell(i.invoiceDate),
        numCell(i.lines.filter((l) => l.kind === "Pregnancy").length),
        { t: money(total), s: total },
        { t: i.status === "Void" ? "Void" : i.exportedAt ? `In QuickBooks ${i.exportedAt.toLocaleDateString("en-US", { timeZone: "America/Chicago" })}` : "Not exported", cls: i.status === "Void" ? "text-red-700" : i.exportedAt ? "text-emerald-700" : "text-amber-700" },
      ],
    };
  });
  const pending = invoices.filter((i) => i.status === "Open" && !i.exportedAt).length;
  return (
    <div>
      <PageHeader title="Billing" sub="Bill customers for confirmed 75-day pregnancies. Tick the cows, build the invoices (one per owner), check the price and add any adjustments, then print it or download it for QuickBooks Online. A cow on an invoice leaves Ready to bill; voiding the invoice puts her back.">
        {pending > 0 && (
          <a className="btn-go edit-only" href="/api/billing/export?pending=1">
            Download {pending} not yet in QuickBooks
          </a>
        )}
      </PageHeader>
      <BillingSettingsForm s={set} />

      <h2 className="mb-1.5 text-base font-semibold text-slate-900">Ready to bill</h2>
      <p className="mb-2 text-xs text-slate-500">Every cow whose record is Safe (confirmed at 75 days) and not on an invoice yet. Date Confirmed is her Safe preg check; Days Pregnant is on that date. A culled cow is a failed pregnancy and never shows here.</p>
      <FilterForm>
        <Pick name="owner" label="Owner" value={owner} options={owners} />
        <span className="pb-2 text-xs text-slate-500">{ready.length} confirmed pregnanc{ready.length === 1 ? "y" : "ies"} to bill</span>
      </FilterForm>
      <Table
        search
        picks={[
          {
            label: "Build invoices",
            url: "/api/billing",
            action: "create",
            ask: `Build invoices for the {n} ticked cow(s)? One invoice per owner, at ${set.price === null ? "$0.00 (no price set yet)" : money(set.price)} each - you can change the price and add adjustments on each invoice before exporting.`,
          },
        ]}
        cols={[{ label: "Tick", noSort: true }, { label: "Owner" }, { label: "Transfer Date" }, { label: "Cow ID" }, { label: "Mating" }, { label: "Due Date" }, { label: "Date Confirmed" }, { label: "Days Pregnant" }, { label: "Group" }]}
        rows={rows}
        empty="Nothing to bill - every confirmed pregnancy is on an invoice."
      />

      <h2 className="mb-1.5 mt-8 text-base font-semibold text-slate-900">Invoices</h2>
      <Table cols={[{ label: "Invoice" }, { label: "Bill To" }, { label: "Date" }, { label: "Pregnancies" }, { label: "Total" }, { label: "QuickBooks" }]} rows={invRows} empty="No invoices yet." />
      <p className="mt-3 text-xs text-slate-500">
        To bring invoices into QuickBooks Online: Sales → Invoices → the arrow beside New invoice → Import invoices, and pick the downloaded file. <Link href="/billing" className="underline">Refresh</Link> after a download to see it marked.
      </p>
    </div>
  );
}
