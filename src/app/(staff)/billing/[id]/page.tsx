import { notFound } from "next/navigation";
import { InvoiceEditor } from "@/components/BillingForms";
import { prisma } from "@/lib/prisma";
import { staffPage } from "@/lib/server/session";
import { letterhead } from "@/lib/server/billing";

export default async function InvoicePage({ params }: { params: { id: string } }) {
  const m = await staffPage();
  const inv = await prisma.invoice.findFirst({ where: { id: params.id, organizationId: m.organizationId }, include: { lines: true } });
  if (!inv) notFound();
  return (
    <InvoiceEditor
      lh={await letterhead(m.organizationId, m.ranch)}
      canEdit={m.role === "OWNER"}
      inv={{
        id: inv.id,
        number: inv.number,
        owner: inv.owner,
        billTo: inv.billTo,
        invoiceDate: inv.invoiceDate,
        dueDate: inv.dueDate,
        price: inv.price,
        memo: inv.memo,
        status: inv.status,
        exported: inv.exportedAt ? inv.exportedAt.toLocaleDateString("en-US", { timeZone: "America/Chicago" }) : null,
        lines: [...inv.lines].sort((a, b) => a.position - b.position).map((l) => ({ id: l.id, kind: l.kind, description: l.description, cowId: l.cowId, batch: l.batch, transferDate: l.transferDate, mating: l.mating, dueDate: l.dueDate, confirmedDate: l.confirmedDate, daysPreg: l.daysPreg, amount: l.amount })),
      }}
    />
  );
}
