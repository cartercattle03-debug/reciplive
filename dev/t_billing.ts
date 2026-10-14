// Billing end to end on the in-memory database: build invoices, change price, adjust, export for QuickBooks Online, void.
import * as fs from "fs";
import { prisma } from "../src/lib/prisma";
import { parseWorkbook } from "../src/lib/workbook";
import * as rec from "../src/lib/server/records";
import * as bill from "../src/lib/server/billing";
import { billable, qboCsv } from "../src/lib/billing";
import { loadRanch } from "../src/lib/server/data";

let fails = 0;
const ok = (name: string, cond: boolean, extra = "") => {
  if (!cond) fails++;
  console.log((cond ? "ok   " : "FAIL ") + name + (cond ? "" : "  " + extra));
};
const refuses = async (name: string, fn: () => Promise<unknown>, word: string) => {
  try {
    await fn();
    ok(name, false, "was not refused");
  } catch (e) {
    ok(name, String((e as Error).message).includes(word), (e as Error).message);
  }
};
(async () => {
  const O = (await prisma.organization.create({ data: { name: "Carter Cattle" } })).id;
  await rec.importWorkbook(O, parseWorkbook(JSON.parse(fs.readFileSync(process.env.WB || "/tmp/claude-0/sav/wb.json", "utf8"))));
  let R = await loadRanch(O);
  let ready = billable(R.calc, R.archive, await bill.billedIds(O));
  ok("ready to bill = every Safe record (162 latest + earlier Safes), no culled", ready.length === R.calc.filter((c) => c.status === "Safe").length && ready.every((l) => R.calc.find((c) => c.id === l.transferId)!.status === "Safe"));
  const one = ready.find((l) => l.confirmedDate)!;
  const c1 = R.calc.find((c) => c.id === one.transferId)!;
  ok("days pregnant = confirmed - transfer + 7", one.daysPreg === Math.round((Date.parse(one.confirmedDate!) - Date.parse(c1.transferDate!)) / 86400000) + 7, `${one.daysPreg}`);
  ok("terms start at Due on receipt", (await bill.billingSettings(O)).terms === 0);
  await bill.saveBillingSettings(O, { price: "$450", item: "75 Day Pregnancy", terms: "15", nextNo: "2001" });
  const weldon = ready.filter((l) => l.owner === "Weldon").slice(0, 3);
  const buck = ready.filter((l) => l.owner === "Buck").slice(0, 2);
  const made = await bill.createInvoices(O, [...weldon, ...buck].map((l) => l.transferId), "2026-10-14");
  ok("one invoice per owner, numbered from 2001", JSON.stringify(made.made.sort()) === "[2001,2002]");
  const invs = await prisma.invoice.findMany({ where: { organizationId: O }, include: { lines: true } });
  const w = invs.find((i) => i.owner === "Weldon")!;
  ok("Weldon invoice: 3 lines at $450, due in 15 days", w.lines.length === 3 && w.lines.every((l) => l.amount === 450) && w.dueDate === "2026-10-29");
  ready = billable(R.calc, R.archive, await bill.billedIds(O));
  ok("billed cows leave Ready to bill", !ready.some((l) => weldon.some((x) => x.transferId === l.transferId)));
  await refuses("can't bill the same cow twice", () => bill.createInvoices(O, [weldon[0].transferId]), "already billed");
  // Price before export: every line, then one line, then an adjustment
  await bill.updateInvoice(O, w.id, { price: "500", applyAll: true });
  let lines = await prisma.invoiceLine.findMany({ where: { invoiceId: w.id } });
  ok("price on every pregnancy line", lines.every((l) => l.amount === 500));
  await bill.updateLine(O, lines[0].id, { amount: "425.50" });
  await bill.addAdjustment(O, w.id, "Volume discount", "-75");
  await refuses("adjustment needs a description", () => bill.addAdjustment(O, w.id, "", "10"), "what the adjustment");
  await refuses("amount must be money", () => bill.updateLine(O, lines[1].id, { amount: "lots" }), "dollar");
  lines = await prisma.invoiceLine.findMany({ where: { invoiceId: w.id } });
  const total = lines.reduce((s, l) => s + l.amount, 0);
  ok("total = 425.50 + 500 + 500 - 75 = 1350.50", Math.abs(total - 1350.5) < 0.001, String(total));
  await bill.updateLine(O, lines.find((l) => l.kind === "Pregnancy")!.id, { confirmedDate: "2026-08-01" });
  const changed = await prisma.invoiceLine.findFirst({ where: { invoiceId: w.id, confirmedDate: "2026-08-01" } });
  ok("changing the confirmed date re-figures days pregnant", !!changed && changed.daysPreg === Math.round((Date.parse("2026-08-01") - Date.parse(changed.transferDate!)) / 86400000) + 7);
  await bill.updateInvoice(O, w.id, { billTo: "Weldon Cattle Co." });
  // QuickBooks Online file
  const exp = await bill.invoicesForExport(O, [w.id]);
  const csv = qboCsv(exp);
  const csvLines = csv.trim().split("\r\n");
  ok("QBO file: heading + 4 lines", csvLines.length === 5, csv);
  ok("QBO heading", csvLines[0] === "InvoiceNo,Customer,InvoiceDate,DueDate,Terms,Memo,Item(Product/Service),ItemDescription,ItemQuantity,ItemRate,ItemAmount,ServiceDate");
  ok("QBO line: number, customer, MM/DD/YYYY, item, amount", csvLines.slice(1).every((l) => l.startsWith("2001,Weldon Cattle Co.,10/14/2026,10/29/2026,Net 15,")) && csvLines.some((l) => l.includes(",75 Day Pregnancy,Cow ") && l.includes(",1,425.50,425.50,")));
  ok("QBO adjustment line", csvLines.some((l) => l.includes(",Adjustment,Volume discount,1,-75.00,-75.00,")), csv);
  console.log("      " + csvLines[1]);
  ok("export marks it sent", !!(await prisma.invoice.findUnique({ where: { id: w.id } }))!.exportedAt);
  const pend = await bill.invoicesForExport(O, "pending");
  ok("'not yet in QuickBooks' = only the Buck invoice", pend.length === 1 && pend[0].billTo === "Buck");
  // Take a cow off, void
  const off = lines.find((l) => l.kind === "Pregnancy")!;
  await bill.removeLine(O, off.id);
  ready = billable(R.calc, R.archive, await bill.billedIds(O));
  ok("a cow taken off an invoice is back on Ready to bill", ready.some((l) => l.transferId === off.transferId));
  await bill.voidInvoice(O, w.id);
  ready = billable(R.calc, R.archive, await bill.billedIds(O));
  ok("void: its cows are back on Ready to bill", weldon.every((x) => ready.some((l) => l.transferId === x.transferId)));
  await refuses("a void invoice can't be changed", () => bill.updateInvoice(O, w.id, { memo: "x" }), "void");
  const again = await bill.createInvoices(O, [weldon[0].transferId], "2026-10-15");
  ok("next invoice number is never reused", again.made[0] === 2003);
  await refuses("next number can't go back below one used", () => bill.saveBillingSettings(O, { nextNo: "2001" }), "already used");
  // Pick owner + group: all ticked, one left off -> she stays on Ready to bill, Held back, until she's billed.
  ready = billable(R.calc, R.archive, await bill.billedIds(O));
  const g = ready.filter((l) => l.owner === "Carter" && l.batch === "4-30");
  const [left, ...going] = g;
  const mk = await bill.createInvoices(O, going.map((l) => l.transferId), "2026-10-20", g.map((l) => l.transferId).filter((id) => going.every((x) => x.transferId !== id)));
  let holds = await bill.billHolds(O);
  ok(`Carter 4-30: ${going.length} billed, 1 held back`, mk.held === 1 && holds.has(left.transferId) && holds.get(left.transferId)!.fromInvoice === mk.made[0] && holds.get(left.transferId)!.since === "2026-10-20");
  ready = billable(R.calc, R.archive, await bill.billedIds(O));
  ok("held-back cow is still on Ready to bill", ready.some((l) => l.transferId === left.transferId));
  await bill.createInvoices(O, [left.transferId], "2026-11-01");
  holds = await bill.billHolds(O);
  ok("billed later: no longer held back", !holds.has(left.transferId));

  // A workbook re-import gives every record a new id - the billed cows must still not come back.
  const billedBefore = billable((await loadRanch(O)).calc, R.archive, await bill.billedIds(O)).length;
  await rec.importWorkbook(O, parseWorkbook(JSON.parse(fs.readFileSync(process.env.WB || "/tmp/claude-0/sav/wb.json", "utf8"))));
  R = await loadRanch(O);
  ok("re-import can't bring billed cows back to Ready to bill", billable(R.calc, R.archive, await bill.billedIds(O)).length === billedBefore, `${billable(R.calc, R.archive, await bill.billedIds(O)).length} vs ${billedBefore}`);
  ready = billable(R.calc, R.archive, await bill.billedIds(O));
  // A culled cow is never billable
  const safe = ready.find((l) => !weldon.some((x) => x.transferId === l.transferId))!;
  await rec.updateTransfer(O, safe.transferId, "status", "Culled");
  R = await loadRanch(O);
  ok("culled after Safe: never billable", !billable(R.calc, R.archive, await bill.billedIds(O)).some((l) => l.transferId === safe.transferId));
  await bill.saveBillingSettings(O, { terms: "0" });
  const dr = await bill.createInvoices(O, [billable(R.calc, R.archive, await bill.billedIds(O))[0].transferId], "2026-12-01");
  const drInv = await prisma.invoice.findFirst({ where: { organizationId: O, number: dr.made[0] } });
  ok("Due on receipt: due date = invoice date", drInv!.dueDate === "2026-12-01");
  const drCsv = qboCsv(await bill.invoicesForExport(O, [drInv!.id]));
  ok("QuickBooks file says Due on receipt", drCsv.split("\r\n")[1].includes(",12/01/2026,12/01/2026,Due on Receipt,"), drCsv);
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
