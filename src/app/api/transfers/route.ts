import { addPregCow, addTransfers, cullTransfers, deleteTransfer, editTransfer, updateTransfer } from "@/lib/server/records";
import { handle, HttpError, staffApi } from "@/lib/server/session";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const m = await staffApi();
  const b = await req.json();
  if (b.action === "update") return updateTransfer(m.organizationId, String(b.id), String(b.field), b.value);
  if (b.action === "edit") return editTransfer(m.organizationId, String(b.id), b.patch);
  if (b.action === "addPreg") return addPregCow(m.organizationId, b.row ?? {});
  if (b.action === "add") return addTransfers(m.organizationId, Array.isArray(b.rows) ? b.rows : []);
  if (b.action === "delete") return deleteTransfer(m.organizationId, String(b.id));
  if (b.action === "cull") return cullTransfers(m.organizationId, Array.isArray(b.ids) ? b.ids.map(String) : []);
  throw new HttpError(400, "Unknown step.");
});
