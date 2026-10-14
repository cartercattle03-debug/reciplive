import { Table, type Row } from "./Table";
import { cowCell, money, numCell } from "@/lib/cells";
import { showDate } from "@/lib/recip";
import type { Step } from "@/lib/cowArchive";

const TONE: Record<string, string> = { Purchased: "text-brand-700", Transfer: "", Pass: "text-slate-500", "Preg Check": "text-amber-800", Delivered: "text-emerald-700", Culled: "text-red-700", "Open List": "text-slate-600", Sold: "text-brand-700" };

/** A cow's whole story, one line per step, in order. With every cow, a heavy line marks where the next cow starts. */
export function ArchiveTable({ steps, showCow = true, showMoney = true }: { steps: Step[]; showCow?: boolean; showMoney?: boolean }) {
  const rows: Row[] = steps.map((s, i) => ({
    key: `${s.cowId}-${i}`,
    cls: showCow && i > 0 && steps[i - 1].cowId !== s.cowId ? "cow-break" : "",
    cells: [
      ...(showCow ? [cowCell(s.cowId)] : []),
      { t: s.date ? showDate(s.date) : s.when, s: s.date ?? "" },
      { t: s.process, cls: `font-semibold ${TONE[s.process] ?? ""}` },
      numCell(s.attempt),
      { t: s.batch, cls: "grp" },
      { t: s.mating },
      { t: s.owner },
      { t: s.embryoType },
      { t: s.grade },
      { t: s.company },
      { t: s.result, cls: s.result ? `st-${s.result.replace(/\s/g, "")}` : "" },
      ...(showMoney ? [{ t: money(s.money), s: s.money ?? "" }] : []),
      { t: s.notes },
    ],
  }));
  return (
    <Table
      search={showCow}
      cols={[...(showCow ? [{ label: "Cow ID" }] : []), { label: "Date" }, { label: "Process" }, { label: "Attempt #" }, { label: "Group" }, { label: "Mating" }, { label: "Owner" }, { label: "Embryo Type" }, { label: "Grade" }, { label: "Company" }, { label: "Result / Status" }, ...(showMoney ? [{ label: "Price" }] : []), { label: "Notes" }]}
      rows={rows}
      empty="Nothing on record yet."
    />
  );
}
