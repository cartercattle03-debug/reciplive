// Renders every page (server part awaited, then the whole tree to HTML) on the imported workbook - catches page crashes offline.
// Run: dev/harness/render.sh
import * as fs from "fs";
import { prisma } from "../src/lib/prisma";
import { parseWorkbook } from "../src/lib/workbook";
import * as rec from "../src/lib/server/records";

const { renderToString } = require("react-dom/server");
const page = (p: string) => require("../src/app/" + p).default;

let fails = 0;
async function show(name: string, p: string, props: any, must: string[] = [], member = "owner", year = 2026) {
  (global as any).SESSION = { user: { id: (global as any)[member] } };
  (global as any).YEAR = year;
  try {
    const el = await page(p)(props);
    const html: string = renderToString(el).replace(/<!-- -->/g, "");
    const missing = must.filter((m) => !html.includes(m));
    if (missing.length) {
      fails++;
      console.log(`FAIL ${name}: missing ${JSON.stringify(missing)}`);
    } else console.log(`ok   ${name} (${Math.round(html.length / 1024)} KB)`);
    return html;
  } catch (e: any) {
    if (e.redirect && must[0] === "REDIRECT " + e.redirect) {
      console.log(`ok   ${name} -> ${e.redirect}`);
      return "";
    }
    fails++;
    console.log(`FAIL ${name}: ${e.stack || e}`);
    return "";
  }
}

(async () => {
  const org = await prisma.organization.create({ data: { name: "Carter Cattle" } });
  const u = await prisma.user.create({ data: { email: "o@x.com", name: "Carter", passwordHash: "h:x" } });
  await prisma.membership.create({ data: { userId: u.id, organizationId: org.id, role: "OWNER" } });
  const cu = await prisma.user.create({ data: { email: "c@x.com", name: "Lehman", passwordHash: "h:x" } });
  await prisma.membership.create({ data: { userId: cu.id, organizationId: org.id, role: "CUSTOMER", ownerName: "Lehman" } });
  const mu = await prisma.user.create({ data: { email: "m@x.com", name: "Hand", passwordHash: "h:x" } });
  await prisma.membership.create({ data: { userId: mu.id, organizationId: org.id, role: "MANAGER" } });
  (global as any).mgr = mu.id;
  const ou = await prisma.user.create({ data: { email: "w@x.com", name: "Office", passwordHash: "h:x" } });
  await prisma.membership.create({ data: { userId: ou.id, organizationId: org.id, role: "OFFICE" } });
  (global as any).office = ou.id;
  (global as any).owner = u.id;
  (global as any).cust = cu.id;

  // Empty ranch first - every page must still open.
  for (const p of ["dashboard", "transfers", "preg-check", "day75", "open", "lookup", "repeats", "breakdowns", "customer", "master", "lists", "import"]) await show(`empty ${p}`, `(staff)/${p}/page`, { searchParams: {} });

  const wb = JSON.parse(fs.readFileSync(process.env.WB || "/tmp/claude-0/sav/wb.json", "utf8"));
  await rec.importWorkbook(org.id, parseWorkbook(wb));
  await show("dashboard", "(staff)/dashboard/page", { searchParams: {} }, ["452", "Pregnancy rate by group", "3-12", "TOTAL"]);
  await show("transfers", "(staff)/transfers/page", { searchParams: {} }, ["Add transfers", "6148", "Casino x 2246", "503 of 503", "+ New group", "Transfer Date", "from Lists"]);
  await show("transfers filtered", "(staff)/transfers/page", { searchParams: { batch: "3-12", status: "Safe" } }, ["of 503 records"]);
  await rec.setPregDraft(org.id, (await prisma.transfer.findFirst({ where: { organizationId: org.id, status: "Probable" } }))!.id, "Safe");
  await show("preg check", "(staff)/preg-check/page", { searchParams: {} }, ["Days Bred", "Result", "pick-btn", "Mating", "+ Add cow", "Confirm &amp; Archive (1)", "Total Cows", "Cows Checked", "goes on her record at Confirm", "First check", "75-day check"]);
  await show("75+ day", "(staff)/day75/page", { searchParams: {} }, ["Undelivered", "Delivered"]);
  for (const s of ["Cow ID", "Repeat Flag", "Total Attempts", "Times Passed", "Date Checked Open"]) await show(`open sort ${s}`, "(staff)/open/page", { searchParams: { sort: s } }, ["Open Inventory", "NEVER SETTLED"]);
  await show("master archive", "(staff)/archive/page", { searchParams: {} }, ["Master Archive", "Purchased", "Preg Check", "Transfer"]);
  await show("master archive one cow", "(staff)/archive/page", { searchParams: { cow: "348-1" } }, ["1 cow", "Sold"]);
  await show("open has tick, cull, move, add, edit", "(staff)/open/page", { searchParams: {} }, ["Tick", "Edit", "+ Add cows", "Open Inventory - 2026"]);
  await show("dashboard 2027 is a fresh slate", "(staff)/dashboard/page", { searchParams: {} }, ["No transfers in 2027 yet"], "owner", 2027);
  {
    const bill = require("../src/lib/server/billing");
    const { billable } = require("../src/lib/billing");
    const { loadRanch } = require("../src/lib/server/data");
    await show("billing page (nothing billed)", "(staff)/billing/page", { searchParams: {} }, ["Ready to bill", "Tick", "Billing settings", "Group (transfer date)", "Invoice header", "Upload logo"]);
    const RR = await loadRanch(org.id);
    const rd = billable(RR.calc, RR.archive, await bill.billedIds(org.id));
    await bill.saveBillingSettings(org.id, { price: "450" });
    await bill.saveLetterhead(org.id, { name: "Carter Cattle LLC", address: "PO Box 1\nStratford, OK 74872", phone: "580-555-0100" });
    const own = await prisma.listItem.findFirst({ where: { organizationId: org.id, kind: "OWNER", value: rd[0].owner } });
    await bill.saveOwnerInfo(org.id, own!.id, { ranchName: "Test Ranch LLC", location: "Ada, OK", email: "test@example.com" });
    await bill.createInvoices(org.id, rd.slice(0, 2).map((l: any) => l.transferId));
    const inv = await prisma.invoice.findFirst({ where: { organizationId: org.id } });
    await bill.addAdjustment(org.id, inv!.id, "Discount", "-50");
    await show("billing page lists the invoice", "(staff)/billing/page", { searchParams: {} }, ["#1001", "Not exported", "Download 1 not yet in QuickBooks"]);
    await show("billing: why isn't 6305 here", "(staff)/billing/page", { searchParams: { why: "6305" } }, ["Cow 6305", "not Safe"]);
    await show("billing filtered: all ticked", "(staff)/billing/page", { searchParams: { owner: "Carter", b: "4-30" } }, ["all ticked", "Build invoice (", "checked=\"\""]);
    await show("invoice page", "(staff)/billing/[id]/page", { params: { id: inv!.id } }, ["INVOICE #1001", "Carter Cattle LLC", "Stratford, OK 74872", "580-555-0100", "Download for QuickBooks", "Use on every pregnancy line", "Add an adjustment", "Days Pregnant", "$850.00", "Test Ranch LLC", "Ada, OK", "test@example.com"]);
    {
      // A billed cow culled afterward: the invoice keeps her, marked as changed (Buck 6-19: invoiced 7, customer view 5).
      const ln = (await prisma.invoiceLine.findMany({ where: { invoiceId: inv!.id, kind: "Pregnancy" } }))[0];
      const recs = require("../src/lib/server/records");
      await recs.updateTransfer(org.id, ln.transferId, "status", "Culled");
      await show("invoice marks a cow culled since", "(staff)/billing/[id]/page", { params: { id: inv!.id } }, ["changed since it was built", "Culled since", ln.cowId]);
      await show("billing list counts the change", "(staff)/billing/page", { searchParams: {} }, ["(1 changed since)"]);
      await recs.updateTransfer(org.id, ln.transferId, "status", "Safe");
    }
    await show("manager kept off an invoice", "(staff)/billing/[id]/page", { params: { id: inv!.id } }, ["REDIRECT /dashboard"], "mgr");
    await show("manager kept off Billing", "(staff)/billing/page", { searchParams: {} }, ["REDIRECT /dashboard"], "mgr");
    // Office (Carter's wife, 2026-10-28): billing, money, customer logins - not cattle records.
    const ob = await show("office opens Billing", "(staff)/billing/page", { searchParams: {} }, ["data-office-edit", "Billing"], "office");
    if (/didn&#x27;t catch up|didn't catch up/.test(ob)) { fails++; console.log("FAIL office sees the status fix-up on Billing"); }
    await show("office opens an invoice, can change it", "(staff)/billing/[id]/page", { params: { id: inv!.id } }, ["data-office-edit", "INVOICE #1001", "Download for QuickBooks", "Add an adjustment"], "office");
    await show("office Lists has owner billing info", "(staff)/lists/page", { searchParams: {} }, ["Ranch Name", "Test Ranch LLC", "data-office-edit"], "office");
    const ml = await show("manager's Lists has no billing info", "(staff)/lists/page", { searchParams: {} }, ["Owners"], "mgr");
    if (/Ranch Name|Test Ranch LLC|test@example.com/.test(ml)) { fails++; console.log("FAIL manager sees owner billing info"); }
  }
  await show("lookup 054", "(staff)/lookup/page", { searchParams: { cow: "054" } }, ["Cow 054", "Lifetime Attempts", "Her full archive"]);
  await show("lookup none", "(staff)/lookup/page", { searchParams: { cow: "nope" } }, ["No records for Cow ID nope"]);
  await show("repeats", "(staff)/repeats/page", { searchParams: {} }, ["1st Attempt", "Settled After 2 Tries"]);
  for (const by of ["batch", "owner", "company", "embryoType", "grade"]) await show(`breakdowns ${by}`, "(staff)/breakdowns/page", { searchParams: { by } }, ["Pregnancy Rate", "TOTAL"]);
  await show("customer none", "(staff)/customer/page", { searchParams: {} }, ["Pick an owner"]);
  await show("customer Lehman", "(staff)/customer/page", { searchParams: { owner: "Lehman", go: "1", m: ["Total Transferred", "Pregnancy Rate"], s: ["Safe", "Open"], sort: "Mating" } }, ["Lehman - Herd Summary", "Total Transferred"]);
  await show("master", "(staff)/master/page", { searchParams: {} }, ["Total Cows on List", "$3,500.00", "348-1"]);
  await show("lists", "(staff)/lists/page", { searchParams: {} }, ["Groups (batches)", "Trans Ova", "Add New Batch", "Ranch Name", "Email Address", "Test Ranch LLC"]);
  await show("account (owner)", "account/page", {}, ["Logins", "Undo", "Workbook import", "c@x.com"]);
  await show("staff layout", "(staff)/layout", { children: "x" }, ["Dashboard", "Customer Search", "Carter Cattle"]);
  await show("my (customer)", "my/page", { searchParams: {} }, ["Lehman - your recips", "Total Transferred"], "cust");
  await show("customer portal has breakdowns", "my/page", { searchParams: { by: "company" } }, ["Your breakdowns", "By Embryo Type", "Pregnancy Rate"], "cust");
  {
    // No company comparison on a customer's page (Carter, 2026-10-16).
    for (const by of ["company", "batch", "grade", "embryoType"]) {
      const h = await show(`customer page (${by}) has no company comparison`, "my/page", { searchParams: { by } }, ["Your breakdowns"], "cust");
      if (/By Company|pregnancy rate by [a-z ]*company|>Company<\/th>[\s\S]*?Pregnancy Rate/i.test(h.slice(h.indexOf("Your breakdowns")))) { fails++; console.log(`FAIL company comparison on customer page (${by})`); }
    }
  }
  const sneak = await show("customer can't peek at another owner with ?as=", "my/page", { searchParams: { as: "Buck Creek" } }, ["Lehman - your recips"], "cust");
  if (/Buck Creek/.test(sneak)) { fails++; console.log("FAIL customer saw another owner via ?as="); }
  {
    // A culled cow reads Open on every list a customer sees (Carter, 2026-10-14); the cull stays in the Master Archive.
    const { loadRanch } = require("../src/lib/server/data");
    const RR = await loadRanch(org.id);
    const cul = RR.calc.find((c: any) => c.status === "Culled" && c.owner);
    if (!cul) console.log("FAIL no culled cow with an owner in the data");
    else {
      const pv = await show(`portal for ${cul.owner} (has culled ${cul.cowId})`, "my/page", { searchParams: { as: cul.owner } }, [cul.cowId]);
      if (/Culled/.test(pv)) { fails++; console.log("FAIL customer portal shows Culled"); } else console.log("ok   customer portal never says Culled");
      const cs = await show(`customer search ${cul.owner} Open`, "(staff)/customer/page", { searchParams: { owner: cul.owner, go: "1", s: ["Open"] } }, [cul.cowId]);
      if (/Culled/.test(cs)) { fails++; console.log("FAIL customer search shows Culled"); }
      const br = await show("breakdowns: no Culled column", "(staff)/breakdowns/page", { searchParams: {} }, ["Open"]);
      if (/>Culled</.test(br)) { fails++; console.log("FAIL breakdowns has a Culled column"); }
      await show("master archive keeps the cull", "(staff)/archive/page", { searchParams: { cow: cul.cowId } }, ["Culled"]);
    }
  }
  {
    // By Mating / Sire / Donor on a customer's page (Carter, 2026-10-15)
    const { splitMating, mateBreakdown } = require("../src/lib/matings");
    const sm = splitMating("Me Too x 9003"), s2 = splitMating("Sure Fire X 91/Z"), s3 = splitMating("Lone");
    if (sm.sire !== "Me Too" || sm.donor !== "9003" || s2.donor !== "91/Z" || s3.sire !== "Lone" || s3.donor !== "") { fails++; console.log("FAIL splitMating"); } else console.log("ok   matings split Sire x Donor");
    const { loadRanch } = require("../src/lib/server/data");
    const { inYear } = require("../src/lib/recip");
    const RR = await loadRanch(org.id, { owner: "Buck" });
    const bc = inYear(RR.calc, 2026);
    const mb = mateBreakdown(bc, "mating"), sb = mateBreakdown(bc, "sire"), db = mateBreakdown(bc, "donor");
    const sum = (b: any) => b.rows.reduce((n: number, r: any) => n + r.total, 0);
    const ok3 = sum(mb) === mb.total.total && sum(sb) === sb.total.total && sum(db) === db.total.total && mb.total.total === bc.filter((c: any) => c.outcome !== "Pass").length;
    if (!ok3) { fails++; console.log("FAIL mating breakdown lines don't add up to the total"); } else console.log(`ok   by mating / sire / donor each add up to ${mb.total.total} transfers`);
    const meToo = sb.rows.find((r: any) => r.value === "Me Too");
    if (!meToo || meToo.total !== bc.filter((c: any) => /^me too\s+x/i.test(c.mating) && c.outcome !== "Pass").length) { fails++; console.log("FAIL sire Me Too adds up across his donors"); } else console.log(`ok   sire Me Too = ${meToo.total} across his donors`);
    if (mb.rows.some((r: any) => r.showRate !== (r.checked >= 3))) { fails++; console.log("FAIL rate shown under 3 checked"); } else console.log("ok   no rate under 3 checked");
    await show("customer by mating", "my/page", { searchParams: { as: "Buck", by: "mating" } }, ["By Mating", "Me Too x 199", "Pregnant / Checked", "under 3 checked", "Lost after Probable"]);
    // Lost after Probable: Probable then Open (a culled Probable too); held = Probable then Safe.
    const { countsOf } = require("../src/lib/recip");
    const RA = await loadRanch(org.id);
    const k = countsOf(RA.calc);
    const lostBy = RA.calc.filter((c: any) => c.wasProbable && c.outcome === "Open");
    const heldBy = RA.calc.filter((c: any) => c.wasProbable && c.outcome === "Safe");
    if (k.lost !== lostBy.length || k.held !== heldBy.length || !(k.lost > 0) || Math.abs(k.lossRate - k.lost / (k.lost + k.held)) > 1e-9) { fails++; console.log("FAIL loss counts"); }
    else console.log(`ok   lost after Probable ${k.lost}, held ${k.held}, loss ${(100 * k.lossRate).toFixed(1)}%`);
    const pc = RA.calc.find((c: any) => c.status === "Probable");
    const recs = require("../src/lib/server/records");
    await recs.updateTransfer(org.id, pc.id, "status", "Culled");
    const RB = await loadRanch(org.id);
    if (countsOf(RB.calc).lost !== k.lost + 1) { fails++; console.log("FAIL a culled Probable is a loss"); } else console.log("ok   a culled Probable counts as lost");
    await recs.updateTransfer(org.id, pc.id, "status", "Probable");
    {
      // A cow checked Safe had to be Probable first (Carter, 2026-10-15): Buck 5-21 had its first check before the archive.
      const { countsOf: cO } = require("../src/lib/recip");
      const b521 = (await loadRanch(org.id)).calc.filter((c: any) => c.owner === "Buck" && c.batch === "5-21");
      const kk = cO(b521);
      if (kk.held !== kk.safe || kk.probables !== kk.held + kk.lost + kk.probable) { fails++; console.log("FAIL Safe counts as Probable first", JSON.stringify(kk)); }
      else console.log(`ok   Buck 5-21 lost after Probable reads ${kk.lost} of ${kk.probables} (every Safe was Probable first)`);
    }
    await show("breakdowns show loss", "(staff)/breakdowns/page", { searchParams: {} }, ["Lost after Probable"]);
    {
      // Fresh / Frozen by company and group: lost after Probable in each cell, an All column per company (Carter, 2026-10-15).
      const html = await show("company grids show lost after Probable", "(staff)/breakdowns/page", { searchParams: { by: "company" } }, ["Fresh - pregnancy rate by company and group", ">All<", "lost "]);
      const { matrix, inYear } = require("../src/lib/recip");
      const RC = await loadRanch(org.id);
      const cy = inYear(RC.calc, 2026);
      const bs = RC.lists.batches.map((b: any) => b.label);
      const m = matrix(cy, "company", RC.lists.companies, "batch", bs, "Fresh");
      const bad = m.filter((r: any) => r.total.lost !== r.cells.reduce((n: number, c: any) => n + c.lost, 0) || r.total.probables !== r.cells.reduce((n: number, c: any) => n + c.probables, 0));
      if (bad.length) { fails++; console.log("FAIL All column doesn't add up", bad.map((r: any) => r.value)); }
      else console.log("ok   All column = sum of its groups: " + m.filter((r: any) => r.total.probables).map((r: any) => `${r.value} lost ${r.total.lost} of ${r.total.probables}`).join(", "));
      if (!html) fails++;
    }
    {
      // Lost after Probable reads as a fraction - "1 of 10" - not a % (Carter, 2026-10-15).
      const html = await show("Buck: lost after Probable as a fraction", "my/page", { searchParams: { as: "Buck" } }, ["Lost after Probable"]);
      const { countsOf, inYear } = require("../src/lib/recip");
      const kb = countsOf(inYear((await loadRanch(org.id, { owner: "Buck" })).calc, 2026));
      if (!html.includes(`${kb.lost} of ${kb.probables}`) || /Loss %/.test(html) || kb.probables < kb.lost + kb.held) { fails++; console.log("FAIL fraction"); } else console.log(`ok   Buck 2026 total reads ${kb.lost} of ${kb.probables} Probables, no %`);
    }
    await show("customer by sire", "my/page", { searchParams: { as: "Buck", by: "sire" } }, ["Me Too", "adds up across all of its matings"]);
    await show("customer by donor", "my/page", { searchParams: { as: "Buck", by: "donor" } }, ["280K", "Donor"]);
  }
  {
    // Recip Rating (Carter, 2026-10-15): half stars, 5 = fresh recip, passes don't count, lost Probable by peers.
    const { recipRatings, starText } = require("../src/lib/rating");
    const { loadRanch } = require("../src/lib/server/data");
    const RR = await loadRanch(org.id);
    const rt = recipRatings(RR.calc);
    const all5 = [...rt.values()].every((r: any) => r.stars >= 1 && r.stars <= 5 && Math.round(r.stars * 2) === r.stars * 2);
    const fresh = [...rt.entries()].filter(([, r]: any) => r.tries === 0).every(([, r]: any) => r.stars === 5);
    const safeUp = [...rt.values()].some((r: any) => r.steps.some((s: any) => s.effect === "up"));
    const passNone = [...rt.values()].every((r: any) => r.steps.filter((s: any) => s.text.startsWith("Pass")).every((s: any) => s.effect === "none"));
    if (!all5 || !fresh || !safeUp || !passNone || starText(3.5) !== "★★★½☆") { fails++; console.log("FAIL rating basics", { all5, fresh, safeUp, passNone, st: starText(3.5) }); }
    else console.log("ok   ratings in half stars 1-5, fresh recips 5, passes don't count");
    // A lost Probable when most others that day held = full Open; when loss was common = half.
    const lostSteps = [...rt.values()].flatMap((r: any) => r.steps).filter((s: any) => s.text.startsWith("Lost a Probable"));
    if (!lostSteps.some((s: any) => s.effect === "light") || !lostSteps.some((s: any) => s.effect === "down")) { fails++; console.log("FAIL lost Probable both ways", lostSteps.map((s: any) => s.effect)); }
    else console.log(`ok   lost Probables: ${lostSteps.filter((s: any) => s.effect === "light").length} counted at half (process), ${lostSteps.filter((s: any) => s.effect === "down").length} as a full Open`);
    await show("open inventory shows ratings", "(staff)/open/page", { searchParams: {} }, [">Rating<", "★", "cull candidate"]);
    const oc = RR.calc.find((c: any) => c.latest && c.status === "Open");
    await show("cow lookup shows her rating", "(staff)/lookup/page", { searchParams: { cow: oc.cowId } }, ["Recip Rating", "★", "Open on"]);
    const cp = await show("customer page has no rating", "my/page", { searchParams: { as: "Buck" } }, ["Buck"]);
    if (/Recip Rating|Cull candidate/.test(cp)) { fails++; console.log("FAIL rating on the customer page"); }
  }
  {
    // Preg Check (Carter, 2026-10-16): an Open draft strikes her row; Add cow on the totals row; 75-day % Loss.
    const recs = require("../src/lib/server/records");
    const { loadRanch } = require("../src/lib/server/data");
    const { pregCheckList } = require("../src/lib/recip");
    const L = pregCheckList((await loadRanch(org.id)).calc, {});
    const p1 = L.find((c: any) => c.status === "Probable" && !c.pregDraft);
    const n1 = L.find((c: any) => c.status !== "Probable" && !c.pregDraft);
    await recs.setPregDraft(org.id, p1.id, "Open");
    await recs.setPregDraft(org.id, n1.id, "Open");
    const html = await show("preg check: Open struck, % Loss, Add cow on the totals row", "(staff)/preg-check/page", { searchParams: {} }, ["struck", "% Loss", "+ Add cow", "75-day check"]);
    const struckCells = (html.match(/class="[^"]*struck[^"]*"/g) || []).length;
    if (struckCells !== 6) { fails++; console.log("FAIL struck cells", struckCells); } else console.log("ok   two Opens = 6 struck cells (Days Bred, Mating, Due Date - never the Cow ID)");
    if (!/% Loss <strong[^>]*>[\d.]+% \(1 of \d+\)/.test(html)) { fails++; console.log("FAIL % Loss shows its count"); } else console.log("ok   75-day row shows % Loss with its count");
    await recs.setPregDraft(org.id, p1.id, "");
    await recs.setPregDraft(org.id, n1.id, "");
  }
  {
    // Customer page (Carter, 2026-10-16): Transfer Date instead of Batch, Sort by above the tip.
    const h = await show("customer page: Transfer Date, Sort by", "my/page", { searchParams: { as: "Buck" } }, ["Sort by", "Transfer Date", "Status", "Show", "By Transfer Date", "5/21/2026", "type=\"radio\""]);
    const top = h.slice(0, h.indexOf("Your breakdowns"));
    if (/>Batch</.test(top) || /legend[^>]*>Batch/.test(top)) { fails++; console.log("FAIL customer page still says Batch"); } else console.log("ok   customer page says Transfer Date, not Batch");
    if (h.indexOf("Sort by") > h.indexOf("Tip: click any column") || h.indexOf("Sort by") < h.indexOf("Total Transferred")) { fails++; console.log("FAIL Sort by is not above the tip"); } else console.log("ok   the bold bar (Sort by, Transfer Date, Status, Show) sits under the totals, above the tip");
    {
      // Sorted by transfer date, then mating; a card per transfer date (Carter, 2026-10-16).
      const { loadRanch } = require("../src/lib/server/data");
      const { customerSearch, inYear, countsOf, showRate } = require("../src/lib/recip");
      const bc = inYear((await loadRanch(org.id, { owner: "Buck" })).calc, 2026);
      const r = customerSearch(bc, { owner: "Buck", batches: [], statuses: [], sort: "Transfer Date" });
      const inOrder = r.rows.every((c: any, i: number) => i === 0 || r.rows[i - 1].batchOrder < c.batchOrder || (r.rows[i - 1].batchOrder === c.batchOrder && r.rows[i - 1].mating.trim().localeCompare(c.mating.trim(), undefined, { numeric: true }) <= 0));
      if (!inOrder) { fails++; console.log("FAIL customer list not by transfer date then mating"); } else console.log("ok   customer list sorts by transfer date, then mating");
      const k = countsOf(bc.filter((c: any) => c.batch === "5-21" && c.outcome !== "Pass"));
      if (!h.includes("By transfer date") || !h.includes(`${k.total} Total Transferred`) || !h.includes(`${k.safe} Safe`) || !h.includes(`${k.open} Open`) || !h.includes(`${k.probable} Probable`) || !h.includes(showRate(k.rate))) { fails++; console.log("FAIL per-date cards"); } else console.log(`ok   per-date cards: 5/21/2026 ${k.total} Total Transferred, ${k.safe} Safe / ${k.probable} Probable / ${k.open} Open, ${showRate(k.rate)}`);
    }
    {
      // Notes: a customer sees them on Probable / Safe cows only (Carter, 2026-10-16).
      const recs = require("../src/lib/server/records");
      const { loadRanch } = require("../src/lib/server/data");
      const bc = (await loadRanch(org.id, { owner: "Buck" })).calc.filter((c: any) => c.transferDate?.startsWith("2026"));
      const safe = bc.find((c: any) => c.status === "Safe"), open = bc.find((c: any) => c.status === "Open");
      await recs.updateTransfer(org.id, safe.id, "notes", "Twin check at 60 days");
      await recs.updateTransfer(org.id, open.id, "notes", "Cystic - do not reuse");
      const hn = await show("customer sees Safe / Probable notes only", "my/page", { searchParams: { as: "Buck" } }, [">Notes<", "Twin check at 60 days"]);
      if (hn.includes("Cystic - do not reuse")) { fails++; console.log("FAIL customer sees a note on an Open cow"); } else console.log("ok   a note on an Open cow stays hidden");
      await recs.updateTransfer(org.id, safe.id, "notes", safe.notes);
      await recs.updateTransfer(org.id, open.id, "notes", open.notes);
    }
    {
      // Picking another breakdown keeps their place on the page and their picks (Carter, 2026-10-16).
      const hk = await show("customer breakdown buttons keep picks", "my/page", { searchParams: { as: "Buck", go: "1", sort: "Mating", s: "Safe" } }, ["By Mating"]);
      const link = (hk.match(/href="(\/my\?[^"]*by=mating[^"]*)"/) || [])[1]?.replace(/&amp;/g, "&") ?? "";
      if (!/sort=Mating/.test(link) || !/s=Safe/.test(link) || !/as=Buck/.test(link)) { fails++; console.log("FAIL breakdown link drops their picks", link); } else console.log("ok   breakdown buttons keep Sort by / Status picks");
    }
    const st = await show("staff Customer Search keeps Batch", "(staff)/customer/page", { searchParams: { owner: "Buck", go: "1" } }, [">Batch<"]);
    if (!st) fails++;
  }
  await show("owner previews Lehman's portal", "my/page", { searchParams: { as: "Lehman" } }, ["Preview:", "Lehman - your recips", "Your breakdowns", "click any column heading", "first preg check", "final preg check"]);
  await show("manager can't use the preview", "my/page", { searchParams: { as: "Lehman" } }, ["REDIRECT /customer"], "mgr");
  await show("customer kept out of staff pages", "(staff)/layout", { children: "x" }, ["REDIRECT /my"], "cust");
  await show("account (customer)", "account/page", {}, ["Change your password"], "cust");
  const my = await show("customer sees no other owners", "my/page", { searchParams: {} }, [], "cust");
  if (/Buck Creek|Weldon/.test(my)) {
    fails++;
    console.log("FAIL customer page shows another owner");
  }
  // Manager: sees every page, view only - every save refused.
  const mlay = await show("manager layout is view only", "(staff)/layout", { children: "x" }, ["data-view", "View only", "Dashboard"], "mgr");
  if (/>Billing<|>Master Sheet<|>Master Archive</.test(mlay)) { fails++; console.log("FAIL manager menu shows a money tab"); } else console.log("ok   manager menu has no Billing / Master Sheet / Master Archive");
  await show("owner menu has Billing", "(staff)/layout", { children: "x" }, [">Billing<", ">Master Sheet<", ">Master Archive<"]);
  await show("manager sees transfers", "(staff)/transfers/page", { searchParams: {} }, ["6148"], "mgr");
  await show("manager kept off Master Sheet", "(staff)/master/page", { searchParams: {} }, ["REDIRECT /dashboard"], "mgr");
  await show("manager kept off Master Archive", "(staff)/archive/page", { searchParams: {} }, ["REDIRECT /dashboard"], "mgr");
  const olk = await show("owner lookup 348-1 shows money", "(staff)/lookup/page", { searchParams: { cow: "348-1" } }, ["Cow 348-1", "Price", "Sold"]);
  const mlk = await show("manager lookup 348-1", "(staff)/lookup/page", { searchParams: { cow: "348-1" } }, ["Cow 348-1", "Her full archive"], "mgr");
  if (/\$\d|>Price<|Purchased|>Sold<|Cost /.test(mlk)) { fails++; console.log("FAIL manager lookup shows money"); } else console.log("ok   manager lookup shows no money");
  if (!/\$\d/.test(olk)) { fails++; console.log("FAIL owner lookup lost the money"); }
  const mop = await show("manager open inventory", "(staff)/open/page", { searchParams: {} }, ["Open Inventory"], "mgr");
  if (/Purchase Date/.test(mop)) { fails++; console.log("FAIL manager open page has purchase form"); }
  const olay = await show("office layout", "(staff)/layout", { children: "x" }, ['data-view="office"', ">Billing<", ">Master Sheet<", ">Master Archive<", "Office"], "office");
  if (/>Import</.test(olay.replace(/edit-only[^>]*>Import</, ""))) { fails++; console.log("FAIL office Import not hidden"); }
  await show("office Master Sheet can be changed", "(staff)/master/page", { searchParams: {} }, ["data-office-edit", "Total Cost"], "office");
  await show("office Master Archive", "(staff)/archive/page", { searchParams: {} }, [], "office");
  const ofk = await show("office lookup shows money", "(staff)/lookup/page", { searchParams: { cow: "348-1" } }, ["Cow 348-1", "Price", "Sold"], "office");
  if (!/\$\d/.test(ofk)) { fails++; console.log("FAIL office lookup has no money"); }
  await show("office kept off Import", "(staff)/import/page", { searchParams: {} }, ["REDIRECT /dashboard"], "office");
  await show("office can preview a customer", "my/page", { searchParams: { as: "Lehman" } }, ["Preview:"], "office");
  const oacc = await show("office account: customer logins, no Undo", "account/page", {}, ["Logins", "data-office-edit", "Customer"], "office");
  if (/Manager \(view only|Office \(billing|text-white">Undo</.test(oacc)) { fails++; console.log("FAIL office can make a manager / office login or sees Undo"); } else console.log("ok   office adds customer logins only, no Undo");
  await show("owner account offers Office", "account/page", {}, ["Office (billing, money, customer logins)", "Undo"]);
  {
    const S = require("../src/lib/server/session");
    const acct = require("../src/app/api/account/route");
    const call = async (who: string, body: any) => {
      (global as any).SESSION = { user: { id: (global as any)[who] } };
      const r = await acct.POST(new Request("http://x/api/account", { method: "POST", body: JSON.stringify(body) }));
      return r.status;
    };
    const expect = (what: string, got: number, want: number) => { if (got !== want) { fails++; console.log(`FAIL ${what}: ${got}`); } else console.log(`ok   ${what}`); };
    (global as any).SESSION = { user: { id: ou.id } };
    await S.staffApi().then(() => { fails++; console.log("FAIL office changed cattle records"); }).catch((e: any) => expect("office can't save transfers / preg / open / import", e.status, 403));
    await S.officeApi().then(() => console.log("ok   office saves money")).catch(() => { fails++; console.log("FAIL office refused a money save"); });
    (global as any).SESSION = { user: { id: mu.id } };
    await S.officeApi().then(() => { fails++; console.log("FAIL manager saved money"); }).catch((e: any) => expect("manager money save refused", e.status, 403));
    expect("office can't add a manager", await call("office", { action: "addLogin", role: "MANAGER", email: "z1@x.com", password: "12345678" }), 403);
    expect("office can't add an office login", await call("office", { action: "addLogin", role: "OFFICE", email: "z2@x.com", password: "12345678" }), 403);
    expect("office adds a customer", await call("office", { action: "addLogin", role: "CUSTOMER", ownerName: "Lehman", email: "z3@x.com", password: "12345678" }), 200);
    const mm = await prisma.membership.findFirst({ where: { userId: mu.id } });
    expect("office can't reset the manager", await call("office", { action: "resetPassword", id: mm!.id, password: "12345678" }), 403);
    const cm = await prisma.membership.findFirst({ where: { userId: cu.id } });
    expect("office resets a customer password", await call("office", { action: "resetPassword", id: cm!.id, password: "12345678" }), 200);
    expect("manager can't add logins", await call("mgr", { action: "addLogin", role: "CUSTOMER", ownerName: "Lehman", email: "z4@x.com", password: "12345678" }), 403);
    expect("owner adds an office login", await call("owner", { action: "addLogin", role: "OFFICE", email: "z5@x.com", password: "12345678" }), 200);
    const z5 = await prisma.user.findUnique({ where: { email: "z5@x.com" } });
    const z5m = await prisma.membership.findFirst({ where: { userId: z5!.id } });
    expect("it's saved as Office", z5m!.role === "OFFICE" ? 1 : 0, 1);
  }
  await show("manager kept off Import", "(staff)/import/page", { searchParams: {} }, ["REDIRECT /dashboard"], "mgr");
  const { staffApi } = require("../src/lib/server/session");
  (global as any).SESSION = { user: { id: mu.id } };
  try {
    await staffApi();
    fails++;
    console.log("FAIL manager save was allowed");
  } catch (e: any) {
    console.log(e.status === 403 ? "ok   manager save refused" : "FAIL manager refusal " + e.message);
    if (e.status !== 403) fails++;
  }
  (global as any).SESSION = { user: { id: u.id } };
  await staffApi().then(() => console.log("ok   owner can still save")).catch(() => { fails++; console.log("FAIL owner refused"); });
  (global as any).owner = "nobody";
  await show("logged out -> login", "(staff)/dashboard/page", { searchParams: {} }, ["REDIRECT /login"]);
  console.log(fails ? `\n${fails} FAILED` : "\nALL PASS");
  process.exit(fails ? 1 : 0);
})();
