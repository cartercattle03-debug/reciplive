// The save logic end to end on the in-memory database: import, Preg Check Confirm & Archive, Undo, edits, lists, customer view.
// Run: dev/harness/run.sh (loads harness/stubs.js first)
import * as fs from "fs";
import { prisma } from "../src/lib/prisma";
import { parseWorkbook } from "../src/lib/workbook";
import * as rec from "../src/lib/server/records";
import { loadRanch } from "../src/lib/server/data";
import { restoreSnapshot } from "../src/lib/server/snapshot";
import { dashboard, inYear, openInventory, pregCheckList, resultsFor } from "../src/lib/recip";
import { cowArchive } from "../src/lib/cowArchive";
import { openList } from "../src/lib/openList";

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
  // The sheet's numbers, plus the three Buck 6-19 cows put forward to their 9/16 Safe (162 -> 165 Safe, 44 -> 41 open).
  ok("dashboard after import = the sheet + the 3 caught-up Safes", d.totalTransfers === 452 && d.confirmedSafe === 165 && d.probable === 22 && d.currentlyOpen === 41 && d.threePlusOpen === 17, JSON.stringify(d));
  ok("Buck 6-19 has 7 Safe", R.calc.filter((c) => c.owner === "Buck" && c.batch === "6-19" && c.status === "Safe").length === 7);
  // The live site was loaded before this fix: the repair step finds them and puts them forward.
  {
    const { statusCatchups } = require("../src/lib/reconcile");
    for (const id of ["6300", "6118", "6139"]) await rec.updateTransfer(O, R.calc.find((c) => c.cowId === id && c.batch === "6-19")!.id, "status", "Open");
    R = await loadRanch(O);
    const ups = statusCatchups(R.calc);
    ok("repair finds exactly the 3", ups.map((u: any) => u.cowId).sort().join() === "6118,6139,6300", JSON.stringify(ups));
    await rec.applyCatchups(O, ups.map((u: any) => u.id));
    R = await loadRanch(O);
    ok("repair: Buck 6-19 back to 7 Safe, nothing left to catch up", R.calc.filter((c) => c.owner === "Buck" && c.batch === "6-19" && c.status === "Safe").length === 7 && statusCatchups(R.calc).length === 0);
  }
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
  R = await loadRanch(O);
  const today = R.today;
  ok("picking a result dates it today", R.calc.find((x) => x.id === picks[0].id)?.pregDraftDate === today);
  await rec.setPregDraft(O, picks[2].id, "");
  R = await loadRanch(O);
  ok("taking the result back off clears its date", !R.calc.find((x) => x.id === picks[2].id)?.pregDraftDate);
  await rec.setPregDraft(O, picks[2].id, "Probable");
  await rec.setPregDraftDate(O, picks[1].id, "2026-10-13");
  await refuses("no date without a result", () => rec.setPregDraftDate(O, list[5].id, "2026-10-13"), "Result first");
  await rec.savePregSettings(O, { pregBatch: "" });
  const before = R.archive.length;
  const c = await rec.confirmPregCheck(O);
  R = await loadRanch(O);
  ok("confirmed 3", c.confirmed === 3);
  ok("results on their own cows", R.calc.find((x) => x.id === picks[0].id)?.status === "Safe" && R.calc.find((x) => x.id === picks[1].id)?.status === "Open" && R.calc.find((x) => x.id === picks[2].id)?.status === "Probable");
  ok("archive +3, each with its own check date", R.archive.length === before + 3 && R.archive.filter((a) => a.checkDate === today).length === 2 && R.archive.some((a) => a.checkDate === "2026-10-13" && a.cowId === picks[1].cowId));
  ok("drafts cleared", R.calc.every((x) => !x.pregDraft));
  // A cow already Probable can only come back Safe or Open (Carter, 2026-10-14)
  ok("Probable cow gets only Safe / Open buttons", JSON.stringify(resultsFor("Probable")) === '["Safe","Open"]' && resultsFor("Pending").length === 3 && resultsFor("Probable", "Probable").length === 3);
  await refuses("Probable refused for a cow already Probable", () => rec.setPregDraft(O, picks[2].id, "Probable"), "already Probable");
  await rec.setPregDraft(O, picks[2].id, "Safe");
  // A result stays on her record while the Group changes and a cow is added mid-check
  const other = pregCheckList(R.calc, {}).find((x) => x.id !== picks[2].id && x.batch !== picks[2].batch)!;
  await rec.savePregSettings(O, { pregBatch: other.batch });
  await rec.setPregDraft(O, other.id, "Open");
  await rec.savePregSettings(O, { pregBatch: picks[2].batch });
  R = await loadRanch(O);
  ok("results kept through a Group change", R.calc.find((x) => x.id === picks[2].id)?.pregDraft === "Safe" && R.calc.find((x) => x.id === other.id)?.pregDraft === "Open");
  for (const id of [picks[2].id, other.id]) await rec.setPregDraft(O, id, "");
  await rec.savePregSettings(O, { pregBatch: "" });
  ok("opened cow now on Open Inventory date", R.calc.find((x) => x.id === picks[1].id)?.dateCheckedOpen === "2026-10-13");

  // ---- Undo the confirm
  const snap = (await prisma.snapshot.findMany({ where: { organizationId: O }, orderBy: { createdAt: "desc" } }))[0];
  ok("snapshot named for the check", snap.label.startsWith("Preg check 2026-10-13 to"), snap.label);
  await restoreSnapshot(O, snap.id);
  R = await loadRanch(O);
  ok("undo: statuses back", R.calc.find((x) => x.id === picks[0].id)?.status === picks[0].status && R.calc.find((x) => x.id === picks[1].id)?.status === picks[1].status);
  ok("undo: archive back", R.archive.length === before);
  ok("undo: 503 records, same ids", R.calc.length === 503 && R.calc.some((x) => x.id === picks[0].id));
  ok("undo: kept a copy of before-undo", (await prisma.snapshot.count({ where: { organizationId: O } })) === 4);

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

  // ---- Open Inventory: cull checked cows, edit a record, and the Master Archive
  const opens = openInventory(R.calc, "Cow ID").slice(0, 2);
  const { countsOf } = require("../src/lib/recip");
  const kBefore = countsOf(R.calc);
  const cu = await rec.cullCows(O, opens.map((o) => o.cowId));
  R = await loadRanch(O);
  const kAfter = countsOf(R.calc);
  ok("culling open cows leaves Open and the rate the same", kAfter.open === kBefore.open && kAfter.rate === kBefore.rate && kAfter.culled === kBefore.culled + opens.filter((o) => o.status === "Open").length, JSON.stringify([kBefore, kAfter]));
  ok("cull: 2 culled, off Open Inventory", cu.culled === 2 && !openInventory(R.calc).some((o) => opens.some((x) => x.cowId === o.cowId)));
  ok("cull: dated in her archive", R.events.filter((e) => e.kind === "Culled" && opens.some((o) => o.cowId === e.cowId)).length === 2);
  const arc = cowArchive(R.calc, R.archive, R.cows, R.events, opens[0].cowId);
  ok("archive ends with today's cull", arc[arc.length - 1].process === "Culled" && !!arc[arc.length - 1].date, JSON.stringify(arc[arc.length - 1]));
  const csnap = (await prisma.snapshot.findMany({ where: { organizationId: O }, orderBy: { createdAt: "desc" } }))[0];
  await restoreSnapshot(O, csnap.id);
  R = await loadRanch(O);
  ok("undo cull: back on Open Inventory, cull date gone", openInventory(R.calc).some((o) => o.cowId === opens[0].cowId) && !R.events.some((e) => e.cowId === opens[0].cowId));
  const o3 = openInventory(R.calc, "Cow ID")[0];
  await rec.editTransfer(O, o3.id, { notes: "sore foot", status: "Culled", grade: "6-1" });
  R = await loadRanch(O);
  const e3 = R.calc.find((x) => x.id === o3.id)!;
  ok("edit pop-up saves every changed column", e3.notes === "sore foot" && e3.status === "Culled" && e3.grade === "6-1");
  ok("culled by edit is dated too", R.events.some((e) => e.transferId === o3.id && e.kind === "Culled"));
  await refuses("edit with a bad value saves nothing", () => rec.editTransfer(O, o3.id, { notes: "changed", status: "Bred" }), "Status must be");
  R = await loadRanch(O);
  ok("...notes unchanged", R.calc.find((x) => x.id === o3.id)!.notes === "sore foot");
  // Master Archive for 348-1: purchase first, then transfers / checks in date order, sale last.
  const a1 = cowArchive(R.calc, R.archive, R.cows, R.events, "348-1");
  ok("archive: purchased first with cost", a1[0].process === "Purchased" && a1[0].money === 3500, JSON.stringify(a1[0]));
  ok("archive: sold last with price", a1[a1.length - 1].process === "Sold" && a1[a1.length - 1].money === 4650);
  const dated = a1.filter((x) => x.date).map((x) => x.date!);
  ok("archive: dates in order", dated.every((d, i) => i === 0 || d >= dated[i - 1]), dated.join(","));
  const all = cowArchive(R.calc, R.archive, R.cows, R.events);
  ok("archive: every cow, every transfer and every check", new Set(all.map((x) => x.cowId)).size >= 286 && all.filter((x) => x.process === "Transfer" || x.process === "Pass").length === R.calc.length && all.filter((x) => x.process === "Preg Check").length === R.archive.length);
  console.log("      e.g. 348-1:", a1.map((x) => `${x.date ?? x.when}:${x.process}${x.result ? "=" + x.result : ""}`).join(" | "));

  // ---- Open list by year: add, take off, move to next year, cull, and a Nov transfer checked Open in January
  R = await loadRanch(O);
  const o26 = openList(R.calc, R.cows, 2026, 2026);
  ok("2026 open list = every open cow today", o26.length === openInventory(R.calc).length, `${o26.length} vs ${openInventory(R.calc).length}`);
  await rec.addOpenCows(O, ["N900", "N901"], 2026, { purchaseDate: "Fall 2026", cost: "3,400", loanLocation: "First United" });
  R = await loadRanch(O);
  let L = openList(R.calc, R.cows, 2026, 2026);
  ok("added cows on the 2026 list", L.some((e) => e.cowId === "N900" && e.added && !e.rec) && R.cows.get("N900")?.cost === 3400);
  const pend = R.calc.find((c) => c.latest && c.status === "Pending")!;
  await refuses("a cow waiting on a check can't be added", () => rec.addOpenCows(O, [pend.cowId], 2026, {}), "waiting on a preg check");
  const safe = R.calc.find((c) => c.latest && c.status === "Safe")!;
  await rec.addOpenCows(O, [safe.cowId], 2026, {});
  R = await loadRanch(O);
  ok("a Safe recip back from calving can be added back", openList(R.calc, R.cows, 2026, 2026).some((e) => e.cowId === safe.cowId && e.added && e.rec?.status === "Safe"));
  ok("...her Safe record is untouched", R.calc.find((c) => c.id === safe.id)!.status === "Safe");
  const offCow = L.find((e) => !e.added)!;
  await rec.takeOffOpen(O, [offCow.cowId], "sold");
  R = await loadRanch(O);
  ok("red X: off the list, dated", !openList(R.calc, R.cows, 2026, 2026).some((e) => e.cowId === offCow.cowId) && R.events.some((e) => e.cowId === offCow.cowId && e.kind === "Taken off open list"));
  ok("red X: her records are untouched", R.calc.filter((c) => c.cowId === offCow.cowId).length === cowArchive(R.calc, R.archive, R.cows, R.events, offCow.cowId).filter((x) => x.process === "Transfer" || x.process === "Pass").length);
  const mv = openList(R.calc, R.cows, 2026, 2026).filter((e) => !e.added).slice(0, 3).map((e) => e.cowId);
  await rec.moveOpenYear(O, [...mv, "N901"], 2027);
  R = await loadRanch(O);
  ok("moved to 2027 opens", mv.every((id) => openList(R.calc, R.cows, 2027, 2026).some((e) => e.cowId === id)) && !openList(R.calc, R.cows, 2026, 2026).some((e) => mv.includes(e.cowId) || e.cowId === "N901"));
  await rec.cullCows(O, ["N900"]);
  R = await loadRanch(O);
  ok("cull a cow with no transfer: off the list, dated", !openList(R.calc, R.cows, 2026, 2026).some((e) => e.cowId === "N900") && R.events.some((e) => e.cowId === "N900" && e.kind === "Culled"));
  // A November 2026 transfer checked Open on 1/15/2027 falls to the 2027 opens.
  await rec.addBatch(O, "11-20", "2026-11-20");
  await rec.addTransfers(O, [{ batch: "11-20", cowId: "NOV1", status: "Pending", embryoType: "Frozen" }]);
  R = await loadRanch(O);
  await rec.setPregDraft(O, R.calc.find((c) => c.cowId === "NOV1")!.id, "Open");
  await rec.setPregDraftDate(O, R.calc.find((c) => c.cowId === "NOV1")!.id, "2027-01-15");
  await rec.confirmPregCheck(O);
  R = await loadRanch(O);
  ok("Nov transfer checked Open in Jan lands in 2027 opens", openList(R.calc, R.cows, 2027, 2027).some((e) => e.cowId === "NOV1") && !openList(R.calc, R.cows, 2026, 2027).some((e) => e.cowId === "NOV1"));
  ok("...and her transfer still counts in 2026", inYear(R.calc, 2026).some((c) => c.cowId === "NOV1"));
  // Taken off, then a new transfer comes back Open: she is back on the list.
  await rec.addBatch(O, "1-30", "2027-01-30");
  await rec.addTransfers(O, [{ batch: "1-30", cowId: offCow.cowId, status: "Pending" }]);
  R = await loadRanch(O);
  await rec.setPregDraft(O, R.calc.find((c) => c.cowId === offCow.cowId && c.latest)!.id, "Open");
  await rec.setPregDraftDate(O, R.calc.find((c) => c.cowId === offCow.cowId && c.latest)!.id, "2027-03-01");
  await rec.confirmPregCheck(O);
  R = await loadRanch(O);
  ok("taken off, new transfer Open: back on that year's list", openList(R.calc, R.cows, 2027, 2027).some((e) => e.cowId === offCow.cowId));
  const steps = cowArchive(R.calc, R.archive, R.cows, R.events, "N901");
  ok("archive shows added + moved", steps.some((x) => x.process === "Open List" && x.result.startsWith("Added")) && steps.some((x) => x.result === "Moved to 2027 opens"), JSON.stringify(steps));

  // ---- The open list follows the work: a new transfer takes her off; Open at preg check puts her on, dated.
  await rec.addOpenCows(O, ["N950"], 2027, {});
  R = await loadRanch(O);
  ok("N950 on 2027 opens", openList(R.calc, R.cows, 2027, 2027).some((e) => e.cowId === "N950"));
  const oldOpen = openList(R.calc, R.cows, 2027, 2027).find((e) => e.rec && e.rec.status === "Open" && e.cowId !== offCow.cowId)!;
  await rec.addTransfers(O, [{ batch: "1-30", cowId: "n950", status: "Pending" }, { batch: "1-30", cowId: oldOpen.cowId, status: "Pending" }]);
  R = await loadRanch(O);
  ok("typed n950 is her (N950), not a new cow", R.calc.some((c) => c.cowId === "N950") && !R.calc.some((c) => c.cowId === "n950"));
  ok("a new transfer takes both off the open list", !openList(R.calc, R.cows, 2027, 2027).some((e) => e.cowId === "N950" || e.cowId === oldOpen.cowId));
  const n950 = R.calc.find((c) => c.cowId === "N950" && c.latest)!;
  await rec.setPregDraft(O, n950.id, "Open");
  await rec.setPregDraftDate(O, n950.id, "2027-03-20");
  await rec.confirmPregCheck(O);
  R = await loadRanch(O);
  const back = openList(R.calc, R.cows, 2027, 2027).find((e) => e.cowId === "N950");
  ok("Open at preg check: on the open list with Date Checked Open", back?.dateCheckedOpen === "2027-03-20" && back?.added === false, JSON.stringify(back));
  const z = R.calc.find((c) => c.cowId === "054")!;
  await rec.addTransfers(O, [{ batch: "1-30", cowId: "54", status: "Pending" }]);
  R = await loadRanch(O);
  ok("typed 54 is cow 054", R.calc.find((c) => c.cowId === "054" && c.latest)?.batch === "1-30" && !R.calc.some((c) => c.cowId === "54"));

  // ---- Preg Check + Add cow (missed off the sheet), Due Date by hand, Mating edit
  const before2 = pregCheckList(R.calc, { batch: "1-30" }).length;
  const keep = pregCheckList((await loadRanch(O)).calc, {}).find((x) => x.status !== "Probable")!;
  await rec.setPregDraft(O, keep.id, "Open");
  await rec.addPregCow(O, { batch: "1-30", cowId: "MISS1", mating: "Late x 1", dueOverride: "2027-11-01" });
  ok("a result typed before a cow is added mid-check stays on her", (await loadRanch(O)).calc.find((x) => x.id === keep.id)?.pregDraft === "Open");
  await rec.setPregDraft(O, keep.id, "");
  R = await loadRanch(O);
  const miss = pregCheckList(R.calc, { batch: "1-30" }).find((c) => c.cowId === "MISS1");
  ok("added cow is on the sheet and counts", !!miss && pregCheckList(R.calc, { batch: "1-30" }).length === before2 + 1);
  ok("her typed Due Date wins and Days Bred follows it", miss?.dueDate === "2027-11-01" && miss?.embryoAge === Math.round((Date.parse(R.today) - Date.parse("2027-01-29")) / 86400000) + 7, `${miss?.dueDate} ${miss?.embryoAge}`);
  await refuses("same cow twice on the sheet refused", () => rec.addPregCow(O, { batch: "1-30", cowId: "miss1" }), "already on the sheet");
  await rec.updateTransfer(O, miss!.id, "mating", "Fixed x 2");
  await rec.updateTransfer(O, miss!.id, "dueOverride", "");
  R = await loadRanch(O);
  const miss2 = R.calc.find((c) => c.id === miss!.id)!;
  ok("mating edit saved; cleared due date goes back to transfer + 276", miss2.mating === "Fixed x 2" && miss2.dueDate === "2027-11-02", miss2.dueDate ?? "");

  // ---- A whole batch at once (100 lines, as from the Add transfers grid)
  const many = Array.from({ length: 100 }, (_, i) => ({ batch: "8-15", cowId: `B${i + 1}`, mating: "Bulk x 1", owner: "Carter", embryoType: "Frozen", grade: "7-1", company: "605", status: i % 10 === 0 ? "Pass" : "Pending" }));
  const big = await rec.addTransfers(O, many);
  R = await loadRanch(O);
  ok("100 lines added in order", big.added === 100 && R.calc.filter((x) => x.batch === "8-15" && x.cowId.startsWith("B")).length === 100);
  ok("bulk lines keep their order", R.calc.findIndex((x) => x.cowId === "B1") < R.calc.findIndex((x) => x.cowId === "B100"));
  await refuses("one bad line stops the whole batch", () => rec.addTransfers(O, [{ batch: "8-15", cowId: "Z1" }, { batch: "8-15", cowId: "Z2", status: "Bred" }]), "Row 2");
  R = await loadRanch(O);
  ok("nothing from the refused batch saved", !R.calc.some((x) => x.cowId === "Z1"));

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
