// The Billing page's Build invoices, through the real save route, for Buck 6-19 (7 Safe after the catch-up).
import * as fs from "fs";
import { prisma } from "../src/lib/prisma";
import { parseWorkbook } from "../src/lib/workbook";
import * as rec from "../src/lib/server/records";
import * as bill from "../src/lib/server/billing";
import { billable } from "../src/lib/billing";
import { loadRanch } from "../src/lib/server/data";
(async () => {
  const org = await prisma.organization.create({ data: { name: "Carter Cattle" } });
  const u = await prisma.user.create({ data: { email: "o@x.com", passwordHash: "h:x" } });
  await prisma.membership.create({ data: { userId: u.id, organizationId: org.id, role: "OWNER" } });
  (global as any).SESSION = { user: { id: u.id } };
  await rec.importWorkbook(org.id, parseWorkbook(JSON.parse(fs.readFileSync("/tmp/claude-0/sav/wb.json", "utf8"))));
  const R = await loadRanch(org.id);
  const rows = billable(R.calc, R.archive, await bill.billedIds(org.id)).filter((l) => l.owner === "Buck" && l.batch === "6-19");
  console.log("Buck 6-19 ready:", rows.map((l) => l.cowId).join(" "));
  const { POST } = require("../src/app/api/billing/route");
  const res = await POST(new Request("http://x/api/billing", { method: "POST", body: JSON.stringify({ action: "create", cowIds: rows.map((l) => l.transferId), unpicked: [] }) }));
  console.log(res.status, await res.text());
  const invs = await prisma.invoice.findMany({ where: { organizationId: org.id }, include: { lines: true } });
  console.log("invoices:", invs.map((i) => `#${i.number} ${i.owner} lines=${i.lines.length}`).join(" | "));
  process.exit(0);
})();
