import Link from "next/link";
import { BillingSettingsForm } from "@/components/BillingForms";
import { FilterForm, Pick } from "@/components/FilterForm";
import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { cowCell, dateCell, money, numCell } from "@/lib/cells";
import { billable } from "@/lib/billing";
import { prisma } from "@/lib/prisma";
import { compareFamily, showDate } from "@/lib/recip";
import { billHolds, billedIds, billingSettings } from "@/lib/server/billing";
import { Checks } from "@/components/Checks";
import { Catchups } from "@/components/Catchups";
import { statusCatchups } from "@/lib/reconcile";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

type SP = { owner?: string; b?: string | string[]; held?: string };

export default async function Billing({ searchParams }: { searchParams: SP }) {
  const m = await staffPage();
  const [{ calc, archive, lists }, set, billed, invoices, holds] = await Promise.all([
    loadRanch(m.organizationId),
    billingSettings(m.organizationId),
    billedIds(m.organizationId),
    prisma.invoice.findMany({ where: { organizationId: m.organizationId }, include: { lines: true }, orderBy: { number: "desc" } }),
    billHolds(m.organizationId),
  ]);
  const owner = searchParams.owner ?? "";
  const groups = Array.isArray(searchParams.b) ? searchParams.b : searchParams.b ? [searchParams.b] : [];
  const heldOnly = searchParams.held === "1";
  const all = billable(calc, archive, billed);
  const order = new Map(lists.batches.map((b) => [b.label, b.order]));
  const ready = all
    .filter((l) => !owner || l.owner === owner)
    .filter((l) => !groups.length || groups.includes(l.batch))
    .filter((l) => !heldOnly || holds.has(l.transferId))
    .sort((a, b) => a.owner.localeCompare(b.owner) || (order.get(a.batch) ?? 0) - (order.get(b.batch) ?? 0) || compareFamily(a.cowId, b.cowId));
  const owners = [...new Set(all.map((l) => l.owner))].sort();
  // Groups that still have something to bill (for this owner), in time order.
  const groupChoices = lists.batches.filter((b) => all.some((l) => l.batch === b.label && (!owner || l.owner === owner))).map((b) => b.label);
  const heldAll = all.filter((l) => holds.has(l.transferId));
  const notes = new Map(calc.map((c) => [c.id, c.notes]));
  const filtered = !!owner || groups.length > 0 || heldOnly;
  const rows: Row[] = ready.map((l) => ({
    key: l.transferId,
    cls: holds.has(l.transferId) ? "flag" : "",
    cells: [
      { t: "", pick: l.transferId },
      { t: l.owner, cls: "font-semibold" },
      { t: l.batch, cls: "grp" },
      dateCell(l.transferDate),
      cowCell(l.cowId),
      { t: l.mating },
      dateCell(l.dueDate),
      { ...dateCell(l.confirmedDate), cls: l.confirmedDate ? "" : "text-slate-400", t: l.confirmedDate ? showDate(l.confirmedDate) : "not on file" },
      numCell(l.daysPreg),
      (() => {
        const h = holds.get(l.transferId);
        return h ? { t: `Held back ${showDate(h.since)}${h.fromInvoice ? ` (left off #${h.fromInvoice})` : ""}`, s: h.since, cls: "font-semibold text-amber-800" } : { t: "" };
      })(),
      { t: notes.get(l.transferId) ?? "", cls: "noshade notes", edit: { api: "transfers", id: l.transferId, field: "notes", kind: "text", value: notes.get(l.transferId) ?? "" } },
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
      <PageHeader title="Billing" sub="Bill customers for confirmed 75-day pregnancies. Pick the owner and the group(s) - every confirmed cow comes up ticked; untick any that aren't going, then build the invoice, check the price and add any adjustments, then print it or download it for QuickBooks Online. A cow on an invoice leaves Ready to bill; voiding the invoice puts her back.">
        {pending > 0 && (
          <a className="btn-go edit-only" href="/api/billing/export?pending=1">
            Download {pending} not yet in QuickBooks
          </a>
        )}
      </PageHeader>
      <BillingSettingsForm s={set} />
      <Catchups list={statusCatchups(calc)} />

      <h2 className="mb-1.5 text-base font-semibold text-slate-900">Ready to bill</h2>
      <p className="mb-2 text-xs text-slate-500">Every cow whose record is Safe (confirmed at 75 days) and not on an invoice yet. Date Confirmed is her Safe preg check; Days Pregnant is on that date. A culled cow is a failed pregnancy and never shows here.</p>
      {heldAll.length > 0 && (
        <div className="mb-3 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-2.5 text-sm text-amber-900">
          <b>{heldAll.length} cow{heldAll.length === 1 ? "" : "s"} held back</b> - left off an earlier invoice and still to bill ({[...new Set(heldAll.map((l) => l.owner))].join(", ")}). They stay here, shaded yellow, until they&apos;re billed.
          <a className="ml-auto font-semibold underline" href={heldOnly ? "/billing" : "/billing?held=1"}>
            {heldOnly ? "Show everything" : "Show only held back"}
          </a>
        </div>
      )}
      <FilterForm className="card items-start p-3">
        <Pick name="owner" label="Owner" value={owner} options={owners} />
        {groupChoices.length > 0 && <Checks name="b" label="Group (transfer date)" options={groupChoices} on={groups} />}
        {heldOnly && <input type="hidden" name="held" value="1" />}
        <span className="pb-2 text-xs text-slate-500">
          {ready.length} confirmed pregnanc{ready.length === 1 ? "y" : "ies"} to bill
          {filtered ? " - all ticked; untick any that aren't going on this invoice" : ""}
        </span>
      </FilterForm>
      <Table
        key={`${owner}|${groups.join(",")}|${heldOnly}`}
        startPicked={filtered}
        search
        picks={[
          {
            label: "Build invoices",
            url: "/api/billing",
            action: "create",
            ask: `Build invoices for the {n} ticked cow(s)? One invoice per owner, at ${set.price === null ? "$0.00 (no price set yet)" : money(set.price)} each - you can change the price and add adjustments on each invoice before exporting.\n\nAny cow on this list left unticked stays on Ready to bill, marked Held back, so she isn't lost.`,
          },
        ]}
        cols={[{ label: "Tick", noSort: true }, { label: "Owner" }, { label: "Group" }, { label: "Transfer Date" }, { label: "Cow ID" }, { label: "Mating" }, { label: "Due Date" }, { label: "Date Confirmed" }, { label: "Days Pregnant" }, { label: "Held Back" }, { label: "Notes" }]}
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
