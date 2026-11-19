import { backupWorkbook } from "@/lib/server/backup";
import { backupApi, HttpError } from "@/lib/server/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** The Backup button: every record this ranch keeps, as one Excel file. */
export async function GET() {
  try {
    const m = await backupApi();
    const { file, name } = await backupWorkbook(m.organizationId);
    return new Response(new Uint8Array(file), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    const status = e instanceof HttpError ? e.status : 500;
    if (status === 500) console.error(e);
    return new Response(e instanceof Error ? e.message : "The backup couldn't be made.", { status, headers: { "Content-Type": "text/plain" } });
  }
}
