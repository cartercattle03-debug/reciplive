import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { cowCell, money } from "@/lib/cells";
import { compareFamily, masterSheet } from "@/lib/recip";
import { loadRanch } from "@/lib/server/data";
import { ownerPage } from "@/lib/server/session";

export default async function Master() {
  const m = await ownerPage();
  const { calc, cows } = await loadRanch(m.organizationId);
  const lines = masterSheet(calc);
  // A Master Sheet line for a cow with no transfers (yet) still shows.
  for (const id of cows.keys()) if (!lines.some((l) => l.cowId === id)) lines.push({ cowId: id, finalDestination: "" });
  lines.sort((a, b) => compareFamily(a.cowId, b.cowId));
  const ed = (cowId: string, field: string, value: string, kind: "text" | "money" = "text") => ({ api: "cows" as const, id: cowId, field, kind, value });
  const rows: Row[] = lines.map((l) => {
    const x = cows.get(l.cowId);
    return {
      key: l.cowId,
      cells: [
        cowCell(l.cowId),
        { t: x?.purchaseDate ?? "", edit: ed(l.cowId, "purchaseDate", x?.purchaseDate ?? "") },
        { t: x?.loanLocation ?? "", edit: ed(l.cowId, "loanLocation", x?.loanLocation ?? "") },
        { t: money(x?.cost ?? null), s: x?.cost ?? "", edit: ed(l.cowId, "cost", x?.cost?.toString() ?? "", "money") },
        { t: l.finalDestination, cls: l.finalDestination === "Culled" ? "st-Culled" : "" },
        { t: money(x?.salePrice ?? null), s: x?.salePrice ?? "", edit: ed(l.cowId, "salePrice", x?.salePrice?.toString() ?? "", "money") },
        { t: x?.soldDate ?? "", edit: ed(l.cowId, "soldDate", x?.soldDate ?? "") },
        { t: x?.transactionNo ?? "", edit: ed(l.cowId, "transactionNo", x?.transactionNo ?? "") },
      ],
    };
  });
  const cost = [...cows.values()].reduce((s, c) => s + (c.cost ?? 0), 0);
  const sale = [...cows.values()].reduce((s, c) => s + (c.salePrice ?? 0), 0);
  return (
    <div data-office-edit>
      <PageHeader title="Master Sheet - All Cows" sub="One line per cow, in Cow ID order. Purchase Date, Loan Location, Cost, Sale Price, Sold Date and Transaction # are typed here and stay with that cow. Final Destination fills itself: Culled, or the owner of her Safe record." />
      <div className="mb-3 flex flex-wrap gap-3">
        <div className="stat"><b>{lines.length}</b><span>Total Cows on List</span></div>
        <div className="stat"><b>{money(cost)}</b><span>Total Cost</span></div>
        <div className="stat"><b>{money(sale)}</b><span>Total Sales</span></div>
      </div>
      <Table search cols={[{ label: "Cow ID" }, { label: "Purchase Date" }, { label: "Loan Location" }, { label: "Cost" }, { label: "Final Destination" }, { label: "Sale Price" }, { label: "Sold Date" }, { label: "Transaction #" }]} rows={rows} />
    </div>
  );
}
