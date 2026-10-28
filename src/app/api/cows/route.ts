import { updateCow } from "@/lib/server/records";
import { handle, officeApi } from "@/lib/server/session";

export const POST = handle(async (req) => {
  const m = await officeApi();
  const b = await req.json();
  return updateCow(m.organizationId, String(b.cowId), String(b.field), b.value);
});
