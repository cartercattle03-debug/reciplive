import { addBatch, addListItem, deleteBatch, deleteListItem, moveBatch, renameListItem, updateBatch } from "@/lib/server/records";
import { handle, HttpError, staffApi } from "@/lib/server/session";

export const POST = handle(async (req) => {
  const m = await staffApi();
  const o = m.organizationId;
  const b = await req.json();
  switch (b.action) {
    case "addBatch":
      return addBatch(o, b.label, b.transferDate);
    case "updateBatch":
      return updateBatch(o, String(b.id), { label: b.label, transferDate: b.transferDate });
    case "moveBatch":
      return moveBatch(o, String(b.id), Number(b.dir));
    case "deleteBatch":
      return deleteBatch(o, String(b.id));
    case "addItem":
      return addListItem(o, String(b.kind), b.value);
    case "renameItem":
      return renameListItem(o, String(b.id), b.value);
    case "deleteItem":
      return deleteListItem(o, String(b.id));
  }
  throw new HttpError(400, "Unknown step.");
});
