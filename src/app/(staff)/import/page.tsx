import { ImportWorkbook } from "@/components/ImportWorkbook";
import { PageHeader } from "@/components/Shell";
import { staffPage } from "@/lib/server/session";
import { redirect } from "next/navigation";

export default async function Import() {
  const m = await staffPage();
  if (m.role !== "OWNER") redirect("/dashboard");
  return (
    <div>
      <PageHeader title="Import" sub="Bring a whole workbook in. To add a few new transfers, use Paste rows on the Transfers page instead - it adds to what's here." />
      <ImportWorkbook />
    </div>
  );
}
