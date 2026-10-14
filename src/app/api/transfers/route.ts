import { addTransfers, deleteTransfer, updateTransfer } from "@/lib/server/records";
import { handle, HttpError, staffApi } from "@/lib/server/session";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const m = await staffApi();
  const b = await req.json();
  if (b.action === "update") return updateTransfer(m.organizationId, String(b.id), String(b.field), b.value);
  if (b.action === "add") return addTransfers(m.organizationId, Array.isArray(b.rows) ? b.rows : []);
  if (b.action === "delete") return deleteTransfer(m.organizationId, String(b.id));
  throw new HttpError(400, "Unknown step.");
});
