import { prisma } from "@/lib/prisma";
import { HttpError, officeApi } from "@/lib/server/session";
import { letterhead } from "@/lib/server/billing";
import { loadRanch } from "@/lib/server/data";
import { cowSheetPdf } from "@/lib/server/cowSheet";

/** ?id=<invoice>: the cow list PDF to attach to the QuickBooks invoice email (owner or Office). */
export async function GET(req: Request) {
  try {
    const m = await officeApi();
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const inv = await prisma.invoice.findFirst({ where: { id, organizationId: m.organizationId }, include: { lines: true } });
    if (!inv) throw new HttpError(404, "That invoice isn't on file.");
    const { calc } = await loadRanch(m.organizationId);
    const byId = new Map(calc.map((c) => [c.id, c]));
    const cows = [...inv.lines]
      .filter((l) => l.kind === "Pregnancy")
      .sort((a, b) => a.position - b.position)
      .map((l) => {
        const c = l.transferId ? byId.get(l.transferId) : undefined;
        return { batch: l.batch, transferDate: l.transferDate, cowId: l.cowId, mating: l.mating, owner: c?.owner || inv.owner, dueDate: l.dueDate, confirmedDate: l.confirmedDate, daysPreg: l.daysPreg, delivery: c?.deliveryStatus ?? "" };
      });
    const pdf = await cowSheetPdf({ lh: await letterhead(m.organizationId, m.ranch), number: inv.number, invoiceDate: inv.invoiceDate, billTo: inv.billTo, billRanch: inv.billRanch, billLocation: inv.billLocation, billEmail: inv.billEmail, cows });
    const name = `${inv.billTo || inv.owner} - invoice ${inv.number} cows.pdf`.replace(/[^\w .-]/g, "");
    return new Response(Buffer.from(pdf), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${name}"` } });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(e instanceof Error ? e.message : "Couldn't make the PDF.", { status, headers: { "Content-Type": "text/plain" } });
  }
}
