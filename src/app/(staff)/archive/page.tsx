import { ArchiveTable } from "@/components/ArchiveTable";
import { PageHeader } from "@/components/Shell";
import { cowArchive } from "@/lib/cowArchive";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function MasterArchive({ searchParams }: { searchParams: { cow?: string } }) {
  const m = await staffPage();
  const { calc, archive, cows, events } = await loadRanch(m.organizationId);
  const cow = (searchParams.cow ?? "").trim();
  const steps = cowArchive(calc, archive, cows, events, cow || undefined);
  const herd = new Set(steps.map((s) => s.cowId)).size;
  return (
    <div>
      <PageHeader
        title="Master Archive"
        sub="Every cow's whole record, in order: purchase (with cost), every transfer, every Pass, every preg check result, delivery, cull and sale. Built from the records themselves, so it always matches - nothing to keep up by hand."
      />
      <form method="get" className="no-print mb-3 flex items-end gap-2">
        <label className="text-xs font-medium text-slate-600">
          One cow
          <input name="cow" defaultValue={cow} className="field mt-0.5 w-36" placeholder="Cow ID" />
        </label>
        <button className="btn">Show</button>
        {cow && (
          <a href="/archive" className="btn-quiet">
            All cows
          </a>
        )}
        <span className="pb-2 text-xs text-slate-500">
          {herd} cow{herd === 1 ? "" : "s"} · {steps.length} lines
        </span>
      </form>
      <ArchiveTable steps={steps} />
    </div>
  );
}
