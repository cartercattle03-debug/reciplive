# Decisions

- 2026-10-14: RecipLive built from Savannah 2.0 as its own app (separate from HerdLive for now; may join it later). Same stack and look as HerdLive.
- 2026-10-14: Customer logins - an owner (e.g. Lehman) gets a read-only view of only their cows and report.
- 2026-10-14: Sheet2 and Sort Sheet were scratch tabs - not brought over.
- 2026-10-14: Customer PDF = Print / Save as PDF from Customer Search for now; emailing it from the app is for later.
- 2026-10-14: Helper columns are not stored - all worked out live (src/lib/recip.ts), checked row-for-row against the workbook.
- 2026-10-14: Attempt # = her records in batch order, then entry order (the sheet's formula had a fixed "row 2" in it).
- 2026-10-14: "Confirm Delivery Updates" (in How To Use but never written) isn't needed - delivery saves as it's picked.
- 2026-10-14: Add transfers is a 10-line grid (+10 more lines, paste a column to fill down, one Add for all) - batches run 40-100+ transfers.
- 2026-10-14: Manager login = view only: sees every page, no changes, no import, no print/download buttons. Only the owner saves.
- 2026-10-14: Red ✕ to delete beside every Transfers line (asks first, Undo keeps a copy); red ✕ clears a line on the Add transfers grid.
- 2026-10-14: Open Inventory gets a Cull tick box (Cull checked = her record turns Culled, dated) and an Edit pop-up for her latest record.
- 2026-10-14: Master Archive: each cow's purchase, every transfer / Pass, every preg check, delivery, cull and sale in order - built live from the records (new CowEvent table holds cull dates). Also at the bottom of Cow Lookup.
