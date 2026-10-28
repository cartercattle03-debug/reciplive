# RecipLive - working notes for Claude

RecipLive is Carter's (Carter Cattle LLC, Stratford, OK) web app version of his **Savannah 2.0** Google Sheets
recip / embryo-transfer workbook and its "Recip Tools" Apps Script. It is a **separate program from HerdLive**
(own repo, own database, own site) - tentatively; it may join HerdLive later, so it shares HerdLive's stack and table style
but none of its logic. Never mix the two.

## Colors
RecipLive's own (Carter, 2026-10-14) so it reads apart from HerdLive: sky blue `#0369a1` (brand-600) headings and buttons,
copper `#b8732e` (rust) accent, light gray row stripes (`#f1f3f5`) with a thin charcoal line (`#6b7280`) under each row. Status colors (Safe green, Open red, Probable yellow) never change.

## Stack
Next.js 14 (App Router), Prisma 5, Postgres on Supabase, NextAuth (email + password, JWT), Tailwind - same as HerdLive.
Hosted on Vercel. The build runs `prisma db push`, so **schema changes must be additive**.

## Where things are
- `src/lib/recip.ts` - every number the workbook's helper columns worked out (Total Attempts, Repeat Flag, Latest Record,
  Attempt #, Embryo Age, Due Date, Times Probable, Date Checked Open, the Preg Check / Open Inventory / 75+ Day lists,
  breakdowns, Customer Search, Master Sheet). Pure functions, computed live on every page load - nothing is stored.
- `src/lib/workbook.ts` - reads a Savannah workbook (sheet rows from the browser) and cleans it (see Rules).
- `src/lib/server/records.ts` - every save. `snapshot.ts` - `withSnapshot()` (all-or-nothing + a copy for Undo, last 15 kept).
- `src/app/(staff)/*` - owner / manager pages. `src/app/my` - a customer login's own page. `src/app/api/*` - saves.

## Rules (Carter's - these are the spec)
- One Transfer row per cow per transfer, or a **Pass** (chute visit, no transfer). Pass counts toward Total Attempts.
- **Latest record** = highest batch order (Lists), then last entered. Current status always reads from it.
- Pregnancy Rate = (Safe + Probable) / (Safe + Open + Probable). Pending and Pass never count. A **Culled** record still counts
  (Carter, 2026-10-14): as Open, a failed pregnancy - even if she was checked Safe first. A culled Pass stays a Pass; a cow already
  marked Delivered keeps her Safe (`outcome` in recip.ts). On screen a culled record **shows** as that outcome - Open, mostly (`shownStatus`, Carter 2026-10-14: customers must not see
  Culled); stored as Culled, and the Master Archive / Master Sheet Final Destination keep the cull. No Culled column in breakdowns.
  **Lost after Probable** (Carter, 2026-10-15): checked Probable (or culled while Probable), then Open = lost; then Safe = held. Shown as a fraction, never a %: "1 of 10" = lost of every record checked Probable (`countsOf` lost / probables, `wasProbable`: any Safe counts as Probable first - Carter 2026-10-15).
- Never Settled = 0 Safe and 2+ Open. Repeat = 2+ records otherwise. Single = 1 record.
- Due Date = transfer date + 276. Embryo Age = days since transfer + 7.
- Preg Check list = latest record Pending / Probable / blank, filtered by Group or Min/Max age. Results are drafts on
  their own row (can't land on another cow) until Confirm & Archive, which writes status + archive in one step.
- **Year box** (cookie `rl_year`, `lib/server/year.ts`): a record's year = its batch's transfer date year. Dashboard, Transfers,
  75+ Day, Breakdowns, Customer Search and Open Inventory show the picked year; history pages are lifetime.
- Open Inventory (`lib/openList.ts`) = latest record Open or Pass, or a cow added straight to the list. Her year = the year she
  was checked Open (Nov / Dec transfer checked in Jan falls to the new year), a Pass's batch year, or the year added.
  Tick -> Cull / Move to next year's opens; red X = off the list (gone) for that record only. Yellow = Times Passed >= 2.
- Preg Check: picking a Result stamps its own Check Date (today, changeable); taking the Result off clears it. A cow already Probable gets only Safe / Open (`resultsFor`); a Pending cow keeps Safe (a late first check). Totals split First check / 75-day check when both are listed. + Add cow (Carter 2026-10-16): group starts blank, Cow ID alone is enough (no group = always listed, her newest record); typing her ID looks her up - waiting on a check = result buttons there, else her latest info fills in.
- Preg checks belong to a record by **group + Cow ID** (`matchChecks`); the mating only breaks a tie (loosely - "91/Z" = "91Z"). Records
  whose status lags their own last check are listed on the Dashboard to fix (`lib/reconcile.ts`); the import fixes them on the way in.
- **Recip Rating** (`lib/rating.ts`, Carter 2026-10-15): 1-5 half stars from her own results weighed by embryo odds (company + type + grade); lost Probable = Open unless 1 in 4+ same-day peers lost (half); passes don't count; every result counts in full (summed, not averaged); red at 2.5 and under (cull). Open Inventory + Cow Lookup only, never customers.
- 75+ Day Cows = latest record Safe. Master Sheet Final Destination = Culled if any record Culled, else owner of her Safe latest record.
- **IDs are text.** Leading zeros matter (054 is not 54). Batch labels and grades are text - never dates.
- A repeated Cow ID is not a duplicate - the same cow has many records.
- Customer logins (role CUSTOMER + ownerName) see only that owner's records, read only. Their page has By Mating / Sire / Donor (`lib/matings.ts`): rate blank under 3 checked (Carter, 2026-10-15). Never a company comparison there - no By Company, no company grids (Carter, 2026-10-16). Their list: Transfer Date (not Batch), sorted Transfer Date then Mating, Notes shown only on Probable / Safe cows.
- Office logins (Carter, 2026-10-28 - his wife): see everything the owner does; change only the money side - Billing / invoices / QuickBooks, owner billing info, Master Sheet purchase / cost / sale, customer logins (`officeApi()`, `seesMoney()`). Never transfers, preg checks, open list, imports, Undo (`staffApi()` is owner only). Screen: Shell `data-view="office"`; only parts inside `[data-office-edit]` unlock (globals.css, `lib/viewLock.ts`).
- Manager logins are view only (Carter, 2026-10-14): nothing about money or customer contact info - no Billing, Master Sheet or Master Archive (`ownerPage()`, Nav `ownerOnly`), Cow Lookup without purchase / cost / sale / Price, no changes, no imports, no print / download. Only the OWNER saves (`staffApi`).
- Big steps (import, Confirm & Archive, delete, cull, Undo) go through `withSnapshot()`.
- Billing (`lib/billing.ts`, `lib/server/billing.ts`, /billing): bills Safe records (outcome Safe) not on an open invoice; one invoice per owner; price / lines / adjustments editable until Void; QuickBooks Online CSV import (`qboCsv`).  Bill To = owner billing info (ListItem ranchName / location / email, Lists → Owners), copied onto each invoice (billRanch / billLocation / billEmail). Invoices are not in Undo snapshots on purpose.
- Master Archive (`src/lib/cowArchive.ts`) is built live from Transfer + PregArchive + CowRecord + CowEvent (cull dates) - nothing stored twice.

## Workbook import clean-ups (found in Carter's file, 2026-10-14)
Grades and archive batch names that Sheets turned into dates go back to "7-1" / "4-30"; company 605 stored as a
number and as text is one company; archive Cow IDs saved as numbers (54) match their leading-zero cow (054) only
when exactly one fits; Master Sheet and 75+ Day typed entries are read beside the Cow ID showing on that line
(the sheet's Master Sheet had lost 58 cows to sorted / deleted rows - all 286 are on the app's Master Sheet).

## How to test (offline - no npm registry or database here)
```bash
python3 dev/wb2json.py Savannah.xlsx /tmp/wb.json        # the real workbook, as the browser reads it (keep out of the repo)
WB=/tmp/wb.json tsx dev/t_engine.ts                      # engine vs the workbook's own cached numbers, row by row
WB=/tmp/wb.json tsx dev/t_breakdowns.ts                  # every breakdown line, total, grid cell, customer, attempt # vs an independent recount
dev/harness/run.sh                                       # saves on an in-memory fake database (needs /tmp/rltc - see below)
dev/harness/render.sh                                    # renders every page on the imported data
```
`/tmp/rltc` is built from HerdLive's test harness (`dev/test-harness` in that repo): its node type stubs, `genprisma.py`,
`make-prisma-types.py`, `genschema.py`, `fakeprisma2.js`, plus `dev/harness/stubs.d.ts` here. Type check:
`tsc -p /tmp/rltc/tsconfig.json` (ignore the known stand-in error `organizationId_cowId`).

## Working with Carter
Rancher, not a programmer: plain language, ranch terms, short answers. Loves flow charts. One step at a time for setup.
Never ask him to paste passwords or keys into chat. He views changes live himself - no screenshots needed.
Keep `docs/DECISIONS.md` current.
