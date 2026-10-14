import type { CustomerFilter } from "./recip";

export type SP = Record<string, string | string[] | undefined>;
export const many = (v: string | string[] | undefined) => (Array.isArray(v) ? v : v ? [v] : []);

/** The Customer Search choices from the page address. Metrics: all shown unless the form was used and some left off. */
export function customerParams(sp: SP, owner: string): { f: CustomerFilter; show: string[] } {
  const used = sp.go === "1";
  const show = used ? many(sp.m) : ["Total Transferred", "75-Day Confirmed", "Currently Probable", "Pregnancy Rate"];
  return { f: { owner, batches: many(sp.b), statuses: many(sp.s), sort: sp.sort === "Mating" ? "Mating" : "Cow ID" }, show };
}
