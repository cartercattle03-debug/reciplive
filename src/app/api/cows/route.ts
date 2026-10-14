import { updateCow } from "@/lib/server/records";
import { handle, staffApi } from "@/lib/server/session";

export const POST = handle(async (req) => {
  const m = await staffApi();
  const b = await req.json();
  return updateCow(m.organizationId, String(b.cowId), String(b.field), b.value);
});
