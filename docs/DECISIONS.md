# Decisions

- 2026-10-14: RecipLive built from Savannah 2.0 as its own app (separate from HerdLive for now; may join it later). Same stack and look as HerdLive.
- 2026-10-14: Customer logins - an owner (e.g. Lehman) gets a read-only view of only their cows and report.
- 2026-10-14: Sheet2 and Sort Sheet were scratch tabs - not brought over.
- 2026-10-14: Customer PDF = Print / Save as PDF from Customer Search for now; emailing it from the app is for later.
- 2026-10-14: Helper columns are not stored - all worked out live (src/lib/recip.ts), checked row-for-row against the workbook.
- 2026-10-14: Attempt # = her records in batch order, then entry order (the sheet's formula had a fixed "row 2" in it).
- 2026-10-14: "Confirm Delivery Updates" (in How To Use but never written) isn't needed - delivery saves as it's picked.
