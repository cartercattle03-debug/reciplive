// The save logic end to end on the in-memory database: import, Preg Check Confirm & Archive, Undo, edits, lists, customer view.
// Run: dev/harness/run.sh (loads harness/stubs.js first)
import * as fs from "fs";
import { prisma } from "../src/lib/prisma";
import { parseWorkbook } from "../src/lib/workbook";
import * as rec from "../src/lib/server/records";
import { loadRanch } from "../src/lib/server/data";
import { restoreSnapshot } from "../src/lib/server/snapshot";
import { dashboard, pregCheckList } from "../src/lib/recip";

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
  const org = await prisma.organization.create({ data: { name: "Test Ranch" } });
  const O = org.id;
  const wb = JSON.parse(fs.readFileSync(process.env.WB || "/tmp/claude-0/sav/wb.json", "utf8"));
  const p = parseWorkbook(wb);
  const r = await rec.importWorkbook(O, p);
  ok("import counts", r.transfers === 503 && r.archive === 230 && r.cows === 228, JSON.stringify(r));
  let R = await loadRanch(O);
  const d = dashboard(R.calc);
  ok("dashboard after import matches the sheet", d.totalTransfers === 452 && d.confirmedSafe === 162 && d.probable === 22 && d.currentlyOpen === 44 && d.threePlusOpen === 20, JSON.stringify(d));
  ok("grades are text, none look like dates", R.calc.every((c) => !/\d{4}/.test(c.grade)));
  ok("company 605 is one value", new Set(R.calc.map((c) => c.company).filter((x) => x.startsWith("605"))).size === 1);
  ok("leading zeros kept", R.calc.some((c) => c.cowId === "054") && R.calc.some((c) => c.cowId === "0018"));
  ok("archive batches are labels", R.archive.every((a) => !a.batch || /^\d+-\d+$/.test(a.batch)), JSON.stringify(R.archive.find((a) => !/^\d+-\d+$/.test(a.batch))));
  ok("Master Sheet entry stays on its cow", R.cows.get("348-1")?.cost === 3500 && R.cows.get("348-1")?.salePrice === 4650);

  // ---- Preg check: type 3 results, change the filter (results must stay with their cows), confirm.
  const list = pregCheckList(R.calc, {});
  const picks = list.slice(0, 3);
  await rec.setPregDraft(O, picks[0].id, "Safe");
  await rec.setPregDraft(O, picks[1].id, "Open");
  await rec.setPregDraft(O, picks[2].id, "Probable");
  await refuses("bad result refused", () => rec.setPregDraft(O, picks[0].id, "Maybe"), "Probable, Safe or Open");
  await rec.savePregSettings(O, { pregBatch: "3-12" });
  await refuses("confirm needs a date", () => rec.confirmPregCheck(O), "Date");
  await rec.savePregSettings(O, { pregDate: "2026-10-14", pregBatch: "" });
  const before = R.archive.length;
  const c = await rec.confirmPregCheck(O);
  R = await loadRanch(O);
  ok("confirmed 3", c.confirmed === 3);
  ok("results on their own cows", R.calc.find((x) => x.id === picks[0].id)?.status === "Safe" && R.calc.find((x) => x.id === picks[1].id)?.status === "Open" && R.calc.find((x) => x.id === picks[2].id)?.status === "Probable");
  ok("archive +3 with date", R.archive.length === before + 3 && R.archive.filter((a) => a.checkDate === "2026-10-14").length === 3);
  ok("drafts cleared", R.calc.every((x) => !x.pregDraft));
  ok("opened cow now on Open Inventory date", R.calc.find((x) => x.id === picks[1].id)?.dateCheckedOpen === "2026-10-14");

  // ---- Undo the confirm
  const snap = (await prisma.snapshot.findMany({ where: { organizationId: O }, orderBy: { createdAt: "desc" } }))[0];
  ok("snapshot named for the check", snap.label.startsWith("Preg check 2026-10-14"), snap.label);
  await restoreSnapshot(O, snap.id);
  R = await loadRanch(O);
  ok("undo: statuses back", R.calc.find((x) => x.id === picks[0].id)?.status === picks[0].status && R.calc.find((x) => x.id === picks[1].id)?.status === picks[1].status);
  ok("undo: archive back", R.archive.length === before);
  ok("undo: 503 records, same ids", R.calc.length === 503 && R.calc.some((x) => x.id === picks[0].id));
  ok("undo: kept a copy of before-undo", (await prisma.snapshot.count({ where: { organizationId: O } })) === 3);

  // ---- New batch + transfers, edits
  await rec.addBatch(O, "8-15", "2026-08-15");
  await refuses("duplicate batch refused", () => rec.addBatch(O, "8-15", "2026-08-15"), "already");
  await refuses("unknown batch refused", () => rec.addTransfers(O, [{ batch: "9-9", cowId: "77" }]), "isn't on Lists");
  const add = await rec.addTransfers(O, [
    { batch: "8-15", cowId: "054", mating: "Test x 1", owner: "Carter", embryoType: "Fresh", grade: "7-1", company: "605", status: "Pending" },
    { batch: "8-15", cowId: "NEW1", owner: "Brand New Owner", status: "Pending" },
  ]);
  ok("added 2", add.added === 2);
  R = await loadRanch(O);
  const n054 = R.calc.filter((x) => x.cowId === "054");
  const latest054 = n054.find((x) => x.latest)!;
  ok("054's new record is her latest, attempt # follows", latest054.batch === "8-15" && latest054.attemptNo === n054.length);
  ok("054 left Open Inventory", !R.calc.some((x) => x.cowId === "054" && x.latest && (x.status === "Open" || x.status === "Pass")));
  ok("new owner joined the list", R.lists.owners.includes("Brand New Owner"));
  ok("new transfer has due date", latest054.dueDate === "2027-05-18", String(latest054.dueDate));
  await rec.updateTransfer(O, latest054.id, "grade", "8-1");
  await refuses("bad status refused", () => rec.updateTransfer(O, latest054.id, "status", "Bred"), "Status must be");
  await refuses("blank cow id refused", () => rec.updateTransfer(O, latest054.id, "cowId", " "), "Cow ID");
  R = await loadRanch(O);
  ok("grade edit stays text", R.calc.find((x) => x.id === latest054.id)?.grade === "8-1");

  // ---- Lists: rename cascades, removal refused while used
  const lehman = await prisma.listItem.findFirst({ where: { organizationId: O, kind: "OWNER", value: "Lehman" } });
  const lehmanRows = R.calc.filter((x) => x.owner === "Lehman").length;
  await prisma.membership.create({ data: { userId: (await prisma.user.create({ data: { email: "l@x.com", passwordHash: "h:x" } })).id, organizationId: O, role: "CUSTOMER", ownerName: "Lehman" } });
  await rec.renameListItem(O, lehman!.id, "Lehman Farms");
  R = await loadRanch(O);
  ok("owner rename on every record", R.calc.filter((x) => x.owner === "Lehman Farms").length === lehmanRows && !R.calc.some((x) => x.owner === "Lehman"));
  ok("owner rename follows the customer login", (await prisma.membership.findFirst({ where: { organizationId: O, role: "CUSTOMER" } }))?.ownerName === "Lehman Farms");
  await refuses("used owner can't be removed", () => rec.deleteListItem(O, lehman!.id), "can't come off");
  const b = await prisma.batch.findFirst({ where: { organizationId: O, label: "3-12" } });
  await rec.updateBatch(O, b!.id, { label: "3-12A" });
  R = await loadRanch(O);
  ok("batch rename on records and archive", !R.calc.some((x) => x.batch === "3-12") && R.calc.some((x) => x.batch === "3-12A"));

  // ---- Customer view sees only their cows
  const cv = await loadRanch(O, { owner: "Lehman Farms" });
  ok("customer sees only their owner's records", cv.calc.length === lehmanRows && cv.calc.every((x) => x.owner === "Lehman Farms"));

  // ---- Master Sheet edit
  await rec.updateCow(O, "NEW1", "cost", "$3,250.50");
  await refuses("bad money refused", () => rec.updateCow(O, "NEW1", "salePrice", "lots"), "dollar");
  R = await loadRanch(O);
  ok("cost saved as a number", R.cows.get("NEW1")?.cost === 3250.5);

  // ---- Delete keeps a copy; Undo brings it back
  const gone = R.calc.find((x) => x.cowId === "NEW1")!;
  await rec.deleteTransfer(O, gone.id);
  R = await loadRanch(O);
  ok("deleted", !R.calc.some((x) => x.id === gone.id));
  const s2 = (await prisma.snapshot.findMany({ where: { organizationId: O }, orderBy: { createdAt: "desc" } }))[0];
  await restoreSnapshot(O, s2.id);
  R = await loadRanch(O);
  ok("undo brings the deleted record back", R.calc.some((x) => x.id === gone.id));

  // ---- Re-import replaces cleanly (and keeps only 15 copies)
  for (let i = 0; i < 14; i++) await rec.importWorkbook(O, p);
  R = await loadRanch(O);
  ok("re-import: same 503 records", R.calc.length === 503);
  ok("only 15 copies kept", (await prisma.snapshot.count({ where: { organizationId: O } })) === 15);

  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
