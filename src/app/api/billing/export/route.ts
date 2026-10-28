import { qboCsv } from "@/lib/billing";
import { invoicesForExport } from "@/lib/server/billing";
import { HttpError, officeApi } from "@/lib/server/session";
import { ranchToday } from "@/lib/recip";

/** The QuickBooks Online invoice import file: ?id=<invoice> (repeatable) or ?pending=1 for every one not exported yet. */
export async function GET(req: Request) {
  try {
    const m = await officeApi();
    const u = new URL(req.url);
    const ids = u.searchParams.getAll("id");
    const list = await invoicesForExport(m.organizationId, u.searchParams.get("pending") ? "pending" : ids);
    if (!list.length) throw new HttpError(400, "No open invoices to export.");
    const name = list.length === 1 ? `RecipLive invoice ${list[0].number}.csv` : `RecipLive invoices ${ranchToday()}.csv`;
    return new Response(qboCsv(list), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="${name}"` } });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    return new Response(e instanceof Error ? e.message : "Export failed.", { status, headers: { "Content-Type": "text/plain" } });
  }
}
