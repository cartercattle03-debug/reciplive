import { PageHeader } from "@/components/Shell";
import { Table, type Row } from "@/components/Table";
import { batchCell, cowCell, dateCell } from "@/lib/cells";
import { DELIVERY, day75, inYear } from "@/lib/recip";
import { pickedYear } from "@/lib/server/year";
import { loadRanch } from "@/lib/server/data";
import { staffPage } from "@/lib/server/session";

export default async function Day75() {
  const m = await staffPage();
  const { calc, lists } = await loadRanch(m.organizationId);
  const year = pickedYear();
  const list = inYear(day75(calc, lists.owners), year);
  const undelivered = list.filter((c) => c.deliveryStatus !== "Delivered").length;
  const rows: Row[] = list.map((c) => ({
    key: c.id,
    cells: [
      batchCell(c),
      cowCell(c.cowId),
      { t: c.mating },
      { t: c.owner },
      dateCell(c.dueDate),
      { t: c.deliveryStatus, edit: { api: "transfers", id: c.id, field: "deliveryStatus", kind: "select", options: [...DELIVERY], value: c.deliveryStatus } },
      { ...dateCell(c.deliveryDate), edit: { api: "transfers", id: c.id, field: "deliveryDate", kind: "date", value: c.deliveryDate ?? "" } },
    ],
  }));
  return (
    <div>
      <PageHeader title={`75+ Day Confirmed Pregnant Cows - ${year} transfers`} sub="Cows whose latest record is Safe - confirmed at the second check, not just Probable. Mark each one Delivered as she goes to her owner; it saves right away." />
      <div className="mb-3 flex gap-3">
        <div className="stat">
          <b>{list.length}</b>
          <span>Total Cows</span>
        </div>
        <div className="stat">
          <b>{undelivered}</b>
          <span>Undelivered</span>
        </div>
      </div>
      <Table search cols={[{ label: "Group" }, { label: "Cow ID" }, { label: "Mating" }, { label: "Owner" }, { label: "Due Date" }, { label: "Delivery Status" }, { label: "Delivery Date" }]} rows={rows} empty="No Safe cows yet." />
    </div>
  );
}
