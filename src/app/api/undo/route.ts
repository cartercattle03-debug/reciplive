import { restoreSnapshot } from "@/lib/server/snapshot";
import { handle, staffApi } from "@/lib/server/session";

export const maxDuration = 120;

export const POST = handle(async (req) => {
  const m = await staffApi(true);
  const b = await req.json();
  await restoreSnapshot(m.organizationId, String(b.id));
  return { ok: true };
});
