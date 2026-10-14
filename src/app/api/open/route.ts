import { addOpenCows, cullCows, moveOpenYear, takeOffOpen } from "@/lib/server/records";
import { handle, HttpError, staffApi } from "@/lib/server/session";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const m = await staffApi();
  const b = await req.json();
  const o = m.organizationId;
  if (b.action === "add") return addOpenCows(o, b.cowIds, Number(b.year), b);
  if (b.action === "off") return takeOffOpen(o, b.cowIds, b.why);
  if (b.action === "move") return moveOpenYear(o, b.cowIds, b.year);
  if (b.action === "cull") return cullCows(o, b.cowIds);
  throw new HttpError(400, "Unknown step.");
});
