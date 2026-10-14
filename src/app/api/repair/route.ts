import { applyCatchups } from "@/lib/server/records";
import { handle, HttpError, staffApi } from "@/lib/server/session";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const m = await staffApi();
  const b = await req.json();
  if (b.action === "catchup") return applyCatchups(m.organizationId, b.cowIds);
  throw new HttpError(400, "Unknown step.");
});
