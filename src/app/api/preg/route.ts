import { clearPregDrafts, confirmPregCheck, savePregSettings, setPregDraft } from "@/lib/server/records";
import { handle, HttpError, staffApi } from "@/lib/server/session";

export const maxDuration = 60;

export const POST = handle(async (req) => {
  const m = await staffApi();
  const b = await req.json();
  if (b.action === "settings") return savePregSettings(m.organizationId, b);
  if (b.action === "draft") return setPregDraft(m.organizationId, String(b.id), b.result);
  if (b.action === "confirm") return confirmPregCheck(m.organizationId);
  if (b.action === "clear") return clearPregDrafts(m.organizationId);
  throw new HttpError(400, "Unknown step.");
});
