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
  (global as any).owner = u.id;
  (global as any).cust = cu.id;

  // Empty ranch first - every page must still open.
  for (const p of ["dashboard", "transfers", "preg-check", "day75", "open", "lookup", "repeats", "breakdowns", "customer", "master", "lists", "import"]) await show(`empty ${p}`, `(staff)/${p}/page`, { searchParams: {} });

  const wb = JSON.parse(fs.readFileSync(process.env.WB || "/tmp/claude-0/sav/wb.json", "utf8"));
  await rec.importWorkbook(org.id, parseWorkbook(wb));
  await show("dashboard", "(staff)/dashboard/page", { searchParams: {} }, ["452", "Pregnancy rate by group", "3-12", "TOTAL"]);
  await show("transfers", "(staff)/transfers/page", { searchParams: {} }, ["Add transfers", "6148", "Casino x 2246", "503 of 503"]);
  await show("transfers filtered", "(staff)/transfers/page", { searchParams: { batch: "3-12", status: "Safe" } }, ["of 503 records"]);
  await rec.setPregDraft(org.id, (await prisma.transfer.findFirst({ where: { organizationId: org.id, status: "Probable" } }))!.id, "Safe");
  await show("preg check", "(staff)/preg-check/page", { searchParams: {} }, ["Days Bred", "Result", "pick-btn", "Mating", "+ Add cow", "Confirm &amp; Archive (1)", "Total Cows", "Cows Checked"]);
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
    await show("billing page (nothing billed)", "(staff)/billing/page", { searchParams: {} }, ["Ready to bill", "Tick", "Billing settings"]);
    const RR = await loadRanch(org.id);
    const rd = billable(RR.calc, RR.archive, await bill.billedIds(org.id));
    await bill.saveBillingSettings(org.id, { price: "450" });
    await bill.createInvoices(org.id, rd.slice(0, 2).map((l: any) => l.transferId));
    const inv = await prisma.invoice.findFirst({ where: { organizationId: org.id } });
    await bill.addAdjustment(org.id, inv!.id, "Discount", "-50");
    await show("billing page lists the invoice", "(staff)/billing/page", { searchParams: {} }, ["#1001", "Not exported", "Download 1 not yet in QuickBooks"]);
    await show("invoice page", "(staff)/billing/[id]/page", { params: { id: inv!.id } }, ["INVOICE #1001", "Download for QuickBooks", "Use on every pregnancy line", "Add an adjustment", "Days Pregnant", "$850.00"]);
    const mv = await show("manager sees the invoice, can't change or download", "(staff)/billing/[id]/page", { params: { id: inv!.id } }, ["INVOICE #1001", "$850.00"], "mgr");
    if (/Download for QuickBooks|Use on every pregnancy line/.test(mv)) { fails++; console.log("FAIL manager gets invoice controls"); }
  }
  await show("lookup 054", "(staff)/lookup/page", { searchParams: { cow: "054" } }, ["Cow 054", "Lifetime Attempts", "Her full archive"]);
  await show("lookup none", "(staff)/lookup/page", { searchParams: { cow: "nope" } }, ["No records for Cow ID nope"]);
  await show("repeats", "(staff)/repeats/page", { searchParams: {} }, ["1st Attempt", "Settled After 2 Tries"]);
  for (const by of ["batch", "owner", "company", "embryoType", "grade"]) await show(`breakdowns ${by}`, "(staff)/breakdowns/page", { searchParams: { by } }, ["Pregnancy Rate", "TOTAL"]);
  await show("customer none", "(staff)/customer/page", { searchParams: {} }, ["Pick an owner"]);
  await show("customer Lehman", "(staff)/customer/page", { searchParams: { owner: "Lehman", go: "1", m: ["Total Transferred", "Pregnancy Rate"], s: ["Safe", "Open"], sort: "Mating" } }, ["Lehman - Herd Summary", "Total Transferred"]);
  await show("master", "(staff)/master/page", { searchParams: {} }, ["Total Cows on List", "$3,500.00", "348-1"]);
  await show("lists", "(staff)/lists/page", { searchParams: {} }, ["Groups (batches)", "Trans Ova", "Add New Batch"]);
  await show("account (owner)", "account/page", {}, ["Logins", "Undo", "Workbook import", "c@x.com"]);
  await show("staff layout", "(staff)/layout", { children: "x" }, ["Dashboard", "Customer Search", "Carter Cattle"]);
  await show("my (customer)", "my/page", { searchParams: {} }, ["Lehman - your recips", "Total Transferred"], "cust");
  await show("customer portal has breakdowns", "my/page", { searchParams: { by: "company" } }, ["Your breakdowns", "By Embryo Type", "Pregnancy Rate"], "cust");
  const sneak = await show("customer can't peek at another owner with ?as=", "my/page", { searchParams: { as: "Buck Creek" } }, ["Lehman - your recips"], "cust");
  if (/Buck Creek/.test(sneak)) { fails++; console.log("FAIL customer saw another owner via ?as="); }
  await show("owner previews Lehman's portal", "my/page", { searchParams: { as: "Lehman" } }, ["Preview:", "Lehman - your recips", "Your breakdowns"]);
  await show("manager can't use the preview", "my/page", { searchParams: { as: "Lehman" } }, ["REDIRECT /customer"], "mgr");
  await show("customer kept out of staff pages", "(staff)/layout", { children: "x" }, ["REDIRECT /my"], "cust");
  await show("account (customer)", "account/page", {}, ["Change your password"], "cust");
  const my = await show("customer sees no other owners", "my/page", { searchParams: {} }, [], "cust");
  if (/Buck Creek|Weldon/.test(my)) {
    fails++;
    console.log("FAIL customer page shows another owner");
  }
  // Manager: sees every page, view only - every save refused.
  await show("manager layout is view only", "(staff)/layout", { children: "x" }, ["data-view", "View only", "Dashboard"], "mgr");
  await show("manager sees transfers", "(staff)/transfers/page", { searchParams: {} }, ["6148"], "mgr");
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
