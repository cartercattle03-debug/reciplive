import { addAdjustment, createInvoices, removeLine, saveBillingSettings, updateInvoice, updateLine, voidInvoice } from "@/lib/server/billing";
import { handle, HttpError, staffApi } from "@/lib/server/session";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const m = await staffApi();
  const o = m.organizationId;
  const b = await req.json();
  switch (b.action) {
    case "settings":
      return saveBillingSettings(o, b);
    case "create":
      return createInvoices(o, b.cowIds ?? b.ids, b.invoiceDate, b.unpicked);
    case "update":
      return updateInvoice(o, String(b.id), b);
    case "line":
      return updateLine(o, String(b.lineId), b);
    case "adjust":
      return addAdjustment(o, String(b.id), b.description, b.amount);
    case "removeLine":
      return removeLine(o, String(b.lineId));
    case "void":
      return voidInvoice(o, String(b.id));
  }
  throw new HttpError(400, "Unknown step.");
});
