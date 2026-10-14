/**
 * Records whose status didn't catch up with their own preg check (Carter, 2026-10-14: Buck 6-19 - three cows
 * checked Safe on 9/16 still read Open, because the old sheet wanted the mating typed exactly the same).
 * Only moves a record forward: a waiting record (blank / Pending / Probable / Not Recorded) to its last check,
 * or an Open record to a later Safe. A Culled or Safe record is never changed here.
 */
import type { Calc } from "./recip";

export type Catchup = { id: string; cowId: string; owner: string; batch: string; status: string; checkDate: string; result: string; mating: string; checkMating: string };

const WAITING = ["", "Pending", "Probable", "Not Recorded"];

export function statusCatchups(calc: Calc[]): Catchup[] {
  const out: Catchup[] = [];
  for (const c of calc) {
    const last = c.checks[c.checks.length - 1];
    if (!last || last.result === c.status) continue;
    const forward = WAITING.includes(c.status) || (c.status === "Open" && last.result === "Safe");
    if (!forward) continue;
    out.push({ id: c.id, cowId: c.cowId, owner: c.owner, batch: c.batch, status: c.status, checkDate: last.checkDate, result: last.result, mating: c.mating, checkMating: last.mating });
  }
  return out;
}
